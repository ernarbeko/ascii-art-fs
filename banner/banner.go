package banner

import (
	"fmt"
	"os"
	"strings"
)

const (
	firstChar     = 32
	lastChar      = 126
	linesPerGlyph = 8
	blockSize     = linesPerGlyph + 1
)

func LoadFont(path string) (map[rune][]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("cannot read font file %q: %w", path, err)
	}

	rawLines := strings.Split(string(data), "\n")
	lines := make([]string, len(rawLines))
	for i, l := range rawLines {
		lines[i] = strings.TrimRight(l, "\r")
	}

	font := make(map[rune][]string)

	for code := firstChar; code <= lastChar; code++ {
		blockIndex := code - firstChar
		start := blockIndex * blockSize

		if start+linesPerGlyph > len(lines) {
			return nil, fmt.Errorf("font file %q is too short or has unexpected format (missing glyph for char %q)", path, rune(code))
		}

		glyph := make([]string, linesPerGlyph)
		copy(glyph, lines[start:start+linesPerGlyph])
		font[rune(code)] = glyph
	}

	return font, nil
}

func Render(text string, font map[rune][]string) (string, error) {
	var output strings.Builder

	textLines := strings.Split(text, "\n")

	for _, line := range textLines {
		if line == "" {
			output.WriteString("\n")
			continue
		}

		for _, r := range line {
			if _, ok := font[r]; !ok {
				return "", fmt.Errorf("unsupported character %q", r)
			}
		}

		for row := 0; row < linesPerGlyph; row++ {
			for _, r := range line {
				output.WriteString(font[r][row])
			}
			output.WriteString("\n")
		}
	}

	return output.String(), nil
}
