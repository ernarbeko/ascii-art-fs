"""Procedural dombra-style background music (royalty-free, generated from scratch).

Two plucked strings tuned a fourth apart (D3 / G3) are synthesised with the
Karplus-Strong algorithm and strummed in the triplet "қағыс" pattern typical of
küi, over a soft frame drum and a low drone.
"""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
D3 = 146.83
MODES = {
    'aeolian':    [0, 2, 3, 5, 7, 8, 10],
    'dorian':     [0, 2, 3, 5, 7, 9, 10],
    'mixolydian': [0, 2, 4, 5, 7, 9, 10],
}
# Melody as scale degrees above D3 (7 = D4), one note per beat, four 8-beat phrases.
PHRASES = [
    [7, 7, 6, 7, 8, 7, 6, 5],
    [6, 6, 5, 4, 3, 4, 5, 4],
    [7, 8, 9, 8, 7, 6, 7, 7],
    [6, 5, 4, 3, 4, 3, 0, 0],
]


def semis(deg, mode):
    sc = MODES[mode]
    return 12 * (deg // 7) + sc[deg % 7]


def hz(semitones):
    return D3 * 2 ** (semitones / 12)


def pluck(freq, dur, rng, bright=.55, decay=.996):
    """Karplus-Strong plucked string, vectorised one period at a time."""
    n = int(SR * dur)
    N = max(2, int(round(SR / freq - .5)))
    exc = rng.uniform(-1, 1, N)
    k = 1 + int((1 - bright) * 6)
    if k > 1:
        exc = np.convolve(exc, np.ones(k) / k, mode='same')
    exc -= exc.mean()
    y = np.zeros(n + N)
    y[:N] = exc
    i = N
    while i < n:
        L = min(N, n - i)
        a = y[i - N:i - N + L]
        b = y[i - N - 1:i - N - 1 + L] if i - N - 1 >= 0 else np.concatenate(([0.], y[:L - 1]))
        y[i:i + L] = decay * .5 * (a + b)
        i += L
    return y[:n]


def add(buf, sig, t, gain=1.):
    s = int(t * SR)
    if s >= len(buf):
        return
    e = min(len(buf), s + len(sig))
    buf[s:e] += gain * sig[:e - s]


def drum(rng, strength=1.):
    n = int(SR * .45)
    t = np.arange(n) / SR
    f = 58 + 60 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    skin = rng.normal(0, 1, n) * np.exp(-t * 60)
    skin = sosfilt(butter(2, [300, 2500], 'bandpass', fs=SR, output='sos'), skin)
    return strength * (body + .25 * skin)


def jingle(rng):
    n = int(SR * .09)
    t = np.arange(n) / SR
    x = rng.normal(0, 1, n) * np.exp(-t * 45)
    return sosfilt(butter(2, 5000, 'highpass', fs=SR, output='sos'), x)


def render(total, tempo=104, mode='aeolian', seed=1, sparse=None):
    rng = np.random.default_rng(seed)
    n = int(SR * total)
    strings_l, strings_r, perc = np.zeros(n), np.zeros(n), np.zeros(n)
    beat = 60 / tempo
    sparse = (tempo < 90) if sparse is None else sparse
    end_strum = total - 1.9
    melody = [d for ph in PHRASES for d in ph]
    t0, b = .12, 0
    while True:
        t = t0 + b * beat
        if t >= end_strum:
            break
        deg = melody[b % len(melody)]
        phrase_end = b % 8 == 7
        mel = hz(semis(deg, mode))
        drone = D3
        hits = [(0, 1., 'D')] if phrase_end else (
            [(0, 1., 'D'), (2 / 3, .7, 'D')] if sparse else [(0, 1., 'D'), (1 / 3, .5, 'U'), (2 / 3, .75, 'D')])
        for frac, vel, dirn in hits:
            th = t + frac * beat + rng.normal(0, .004)
            v = vel * (1 + rng.normal(0, .08))
            ring = beat * (2.6 if phrase_end else 1.2)
            m = pluck(mel, ring, rng, bright=.45 + .3 * v)
            if dirn == 'D':
                dr = pluck(drone, ring, rng, bright=.4 + .2 * v)
                add(strings_l, dr, th, .55 * v)
                add(strings_r, m, th + .012, .8 * v)
            else:
                add(strings_r, m, th, .55 * v)
        bar_pos = b % 2
        add(perc, drum(rng, .28 if bar_pos == 0 else .16), t)
        if not sparse:
            add(perc, jingle(rng), t + beat / 3, .05)
            add(perc, jingle(rng), t + 2 * beat / 3, .08)
        b += 1
    # Final resolving strum on the tonic.
    for f, g, side in [(D3, .6, 'l'), (hz(7), .5, 'r'), (hz(12), .45, 'r')]:
        add(strings_l if side == 'l' else strings_r, pluck(f, 2.2, rng, .5, .998), end_strum + .05, g)
    add(perc, drum(rng, .3), end_strum + .05)

    # Wooden body colour for the strings.
    body = butter(2, [180, 3200], 'bandpass', fs=SR, output='sos')
    def colour(x):
        return .7 * x + .6 * sosfilt(body, x)
    sl, sr_ = colour(strings_l), colour(strings_r)

    # Soft drone pad (D2 + A2) that swells in and out.
    tt = np.arange(n) / SR
    pad = (np.sin(2 * np.pi * 73.42 * tt) + .6 * np.sin(2 * np.pi * 110 * tt) + .25 * np.sin(2 * np.pi * 146.83 * tt))
    pad *= .05 * (.75 + .25 * np.sin(2 * np.pi * tt / 6))

    L = sl + .35 * sr_ + pad + perc
    R = sr_ + .35 * sl + pad + perc

    # Simple stereo reverb from decaying filtered noise.
    ir_n = int(SR * 1.4)
    ir_t = np.arange(ir_n) / SR
    lp = butter(1, 4000, 'lowpass', fs=SR, output='sos')
    irL = sosfilt(lp, rng.normal(0, 1, ir_n)) * np.exp(-ir_t * 4.5)
    irR = sosfilt(lp, rng.normal(0, 1, ir_n)) * np.exp(-ir_t * 4.5)
    irL /= np.sqrt((irL ** 2).sum()); irR /= np.sqrt((irR ** 2).sum())
    L = L + .22 * fftconvolve(L, irL)[:n]
    R = R + .22 * fftconvolve(R, irR)[:n]

    out = np.stack([L, R], 1)
    out = sosfilt(butter(2, 45, 'highpass', fs=SR, output='sos'), out, axis=0)
    fade_in, fade_out = int(.08 * SR), int(1.0 * SR)
    out[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    out[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None] ** 1.5
    out /= np.abs(out).max() / .89
    return out.astype(np.float32)


if __name__ == '__main__':
    import sys
    from scipy.io import wavfile
    total, path = float(sys.argv[1]), sys.argv[2]
    wavfile.write(path, SR, (render(total) * 32767).astype(np.int16))
