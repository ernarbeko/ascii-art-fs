package banner

import (
	"strings"
	"testing"
)

func TestLoadFontMissingFile(t *testing.T) {
	_, err := LoadFont("does_not_exist.txt")
	if err == nil {
		t.Error("expected an error when loading a non-existent font file, got nil")
	}
}

func TestRenderUnsupportedCharacter(t *testing.T) {
	fakeFont := map[rune][]string{
		'A': {"1", "2", "3", "4", "5", "6", "7", "8"},
	}
	_, err := Render("€", fakeFont)
	if err == nil {
		t.Error("expected an error for unsupported character, got nil")
	}
}

func TestRenderBasic(t *testing.T) {
	fakeFont := map[rune][]string{
		'A': {"A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"},
		'B': {"B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"},
	}

	got, err := Render("AB", fakeFont)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := "A1B1\nA2B2\nA3B3\nA4B4\nA5B5\nA6B6\nA7B7\nA8B8\n"
	if got != want {
		t.Errorf("Render(\"AB\")\n got:  %q\n want: %q", got, want)
	}
}

func TestRenderEmptyLine(t *testing.T) {
	fakeFont := map[rune][]string{
		'A': {"A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"},
	}

	got, err := Render("A\n\nA", fakeFont)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if strings.Count(got, "\n\n") < 1 {
		t.Errorf("expected a blank line between banners, got: %q", got)
	}
}
