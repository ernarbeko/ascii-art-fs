#!/usr/bin/env python3
"""Builds Instagram Reels (1080x1920) from the scripts in reels/*.json.

For every reel it synthesises the Kazakh voice-over (espeak-ng), fits the
scene timings to it, renders the motion graphics (Chromium + Playwright),
generates dombra music, and muxes two versions:
  out/<id>.mp4          music only (text on screen)
  out/<id>_dauys.mp4    music + Kazakh voice-over
plus out/<id>_cover.png for the Reels cover.

Usage: python3 build.py [reel-id ...] [--stills t1,t2,...] [--reuse-visual]
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render'))
import music  # noqa: E402

ROOT = os.path.dirname(os.path.abspath(__file__))
SR = music.SR
VOICE_LEAD = {'hook': .25, 'item': .3, 'fact': .3, 'cta': .9}
VOICE_CHAIN = ('highpass=f=90,lowpass=f=7500,equalizer=f=220:t=q:w=1.2:g=2,'
               'acompressor=threshold=-20dB:ratio=3:attack=5:release=80,volume=2.0,aecho=0.8:0.5:35:0.12')


def run(cmd, **kw):
    subprocess.run(cmd, check=True, **kw)


def speak(text, path, cfg):
    text = text.replace('—', ',')
    run(['espeak-ng', '-v', cfg['voice'], '-s', str(cfg['speed']), '-p', str(cfg['pitch']), '-w', path, text])
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def build(reel_id, cfg, stills=None, reuse_visual=False):
    spec = json.load(open(os.path.join(ROOT, 'reels', reel_id + '.json')))
    work = os.path.join(ROOT, 'build', reel_id)
    os.makedirs(work, exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'out'), exist_ok=True)

    # 1. Voice clips decide how long each scene lasts.
    t, voice_marks = 0., []
    for i, sc in enumerate(spec['scenes']):
        lead = VOICE_LEAD[sc['type']]
        dur = sc.get('min', 2.5)
        if sc.get('voice'):
            vp = os.path.join(work, f'voice_{i}.wav')
            vd = speak(sc['voice'], vp, cfg['voice'])
            dur = max(dur, lead + vd + .55)
            voice_marks.append((t + lead, vp))
        sc['start'], sc['dur'] = round(t, 3), round(dur, 3)
        t += dur
    total = round(t, 3)

    timeline = {'palette': spec['palette'], 'brand': cfg['brand'], 'scenes': spec['scenes'], 'total': total}
    if 'pin' in spec:
        pin = dict(spec['pin'])
        until_type = pin.pop('until')
        until = next(s for s in spec['scenes'] if s['type'] == until_type)
        pin['end'] = until['start'] + .35
        timeline['pin'] = pin
    tl_path = os.path.join(work, 'timeline.json')
    json.dump(timeline, open(tl_path, 'w'), ensure_ascii=False, indent=1)
    node = ['node', os.path.join(ROOT, 'render', 'render.cjs'), tl_path]
    env = dict(os.environ, NODE_PATH=subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True).stdout.strip())

    if stills:
        run(node + [os.path.join(work, 'stills'), '--stills', stills], env=env)
        return

    # 2. Visuals.
    visual = os.path.join(work, 'visual.mp4')
    if not (reuse_visual and os.path.exists(visual)):
        run(node + [visual], env=env)
        run(node + [work, '--stills', str(spec.get('cover_at', 2.5))], env=env)
        os.replace(os.path.join(work, f"t{spec.get('cover_at', 2.5):.2f}.png"), os.path.join(ROOT, 'out', reel_id + '_cover.png'))

    # 3. Music.
    m = spec.get('music', {})
    mus = music.render(total, m.get('tempo', 104), m.get('mode', 'aeolian'), m.get('seed', 1))
    mus_path = os.path.join(work, 'music.wav')
    wavfile.write(mus_path, SR, (mus * 32767).astype(np.int16))

    # 4. Voice track placed on the timeline.
    vtrack = np.zeros(int(total * SR) + SR)
    for start, vp in voice_marks:
        sr_v, v = wavfile.read(vp)
        v = v.astype(np.float32) / 32768
        if sr_v != SR:
            v = resample_poly(v, SR, sr_v)
        s = int(start * SR)
        vtrack[s:s + len(v)] += v[:len(vtrack) - s]
    vtrack = vtrack[:int(total * SR)]
    voice_path = os.path.join(work, 'voice.wav')
    wavfile.write(voice_path, SR, (np.clip(vtrack, -1, 1) * 32767).astype(np.int16))

    # 5. Mux both versions.
    common = ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest']
    out_music = os.path.join(ROOT, 'out', reel_id + '.mp4')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', visual, '-i', mus_path,
         '-filter_complex', '[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]', '-map', '0:v', '-map', '[a]'] + common + [out_music])
    out_voice = os.path.join(ROOT, 'out', reel_id + '_dauys.mp4')
    fc = (f'[2:a]{VOICE_CHAIN},asplit=2[v1][v2];[1:a]volume=0.45[m];'
          '[m][v2]sidechaincompress=threshold=0.03:ratio=10:attack=15:release=350[md];'
          '[md][v1]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', visual, '-i', mus_path, '-i', voice_path,
         '-filter_complex', fc, '-map', '0:v', '-map', '[a]'] + common + [out_voice])
    print(f'{reel_id}: {total:.1f}s -> {out_music}, {out_voice}')


if __name__ == '__main__':
    args = sys.argv[1:]
    stills = None
    if '--stills' in args:
        i = args.index('--stills')
        stills = args[i + 1]
        del args[i:i + 2]
    reuse = '--reuse-visual' in args
    if reuse:
        args.remove('--reuse-visual')
    cfg = json.load(open(os.path.join(ROOT, 'config.json')))
    ids = args or sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, 'reels')) if f.endswith('.json'))
    for rid in ids:
        build(rid, cfg, stills, reuse)
