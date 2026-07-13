package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

var binPath string

func TestMain(m *testing.M) {
	tmp, err := os.MkdirTemp("", "asciiart-test")
	if err != nil {
		fmt.Println("не удалось создать временную папку:", err)
		os.Exit(1)
	}

	binPath = filepath.Join(tmp, "ascii-art")
	build := exec.Command("go", "build", "-o", binPath, ".")
	build.Stderr = os.Stderr
	if err := build.Run(); err != nil {
		fmt.Println("не удалось собрать программу:", err)
		os.RemoveAll(tmp)
		os.Exit(1)
	}

	code := m.Run()
	os.RemoveAll(tmp)
	os.Exit(code)
}

func run(t *testing.T, args ...string) (string, int) {
	t.Helper()

	cmd := exec.Command(binPath, args...)
	out, err := cmd.CombinedOutput()

	code := 0
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			code = ee.ExitCode()
		} else {
			t.Fatalf("не удалось запустить программу: %v", err)
		}
	}
	return string(out), code
}

func assertRendered(t *testing.T, out string, code int) {
	t.Helper()

	if code != 0 {
		t.Fatalf("ожидался код выхода 0, получено %d; вывод:\n%s", code, out)
	}

	rows := strings.Split(strings.TrimRight(out, "\n"), "\n")
	if len(rows) != 8 {
		t.Fatalf("ожидалось 8 строк вывода, получено %d; вывод:\n%s", len(rows), out)
	}

	if strings.TrimSpace(out) == "" {
		t.Error("вывод состоит из одних пробелов — ничего не нарисовалось")
	}

	maxW := 0
	for _, r := range rows {
		if len(r) > maxW {
			maxW = len(r)
		}
	}
	if maxW == 0 {
		t.Fatalf("все строки пустые; вывод:\n%s", out)
	}
	for i, r := range rows {
		if len(r) != 0 && len(r) != maxW {
			t.Errorf("строка %d шириной %d, ожидалось 0 или %d (колонки разъехались)",
				i, len(r), maxW)
		}
	}
}


func TestUppercaseLetters(t *testing.T) {
	out, code := run(t, "HELLO")
	assertRendered(t, out, code)
}

func TestDigits(t *testing.T) {
	out, code := run(t, "0123456789")
	assertRendered(t, out, code)
}

func TestSymbols(t *testing.T) {
	out, code := run(t, "!@#$%&*()")
	assertRendered(t, out, code)
}

func TestLowercaseLetters(t *testing.T) {
	out, code := run(t, "hello")
	assertRendered(t, out, code)
}

func TestMixedLettersDigitsSymbols(t *testing.T) {
	out, code := run(t, "Go 1.21!")
	assertRendered(t, out, code)
}

func TestEachCategorySeparately(t *testing.T) {
	cases := map[string]string{
		"заглавные": "ABCDEF",
		"строчные":  "abcdef",
		"цифры":     "012345",
		"символы":   "+-=:?/",
	}
	for name, text := range cases {
		t.Run(name, func(t *testing.T) {
			out, code := run(t, text)
			assertRendered(t, out, code)
		})
	}
}


func TestAllBannerFonts(t *testing.T) {
	for _, font := range []string{"standard", "shadow", "thinkertoy"} {
		t.Run(font, func(t *testing.T) {
			out, code := run(t, "Hi 7!", font)
			assertRendered(t, out, code)
		})
	}
}

func TestDefaultFontIsStandard(t *testing.T) {
	withDefault, c1 := run(t, "test")
	withExplicit, c2 := run(t, "test", "standard")

	if c1 != 0 || c2 != 0 {
		t.Fatalf("ненулевой код выхода: %d и %d", c1, c2)
	}
	if withDefault != withExplicit {
		t.Error("вывод без шрифта не совпал с выводом для standard")
	}
}

func TestEmptyStringInput(t *testing.T) {
	out, code := run(t, "")
	if code != 0 {
		t.Fatalf("ожидался код 0, получено %d", code)
	}
	if out != "\n" {
		t.Errorf("ожидался один перевод строки, получено %q", out)
	}
}

func TestNewlineInInput(t *testing.T) {
	out, code := run(t, "a\nb")
	if code != 0 {
		t.Fatalf("ожидался код 0, получено %d", code)
	}
	if got := strings.Count(out, "\n"); got != 16 {
		t.Errorf("ожидалось 16 строк вывода (2 баннера), получено %d", got)
	}
}

func TestNoArgumentsShowsUsage(t *testing.T) {
	out, code := run(t)
	if code != 1 {
		t.Errorf("ожидался код выхода 1, получено %d", code)
	}
	if !strings.Contains(out, "Usage") {
		t.Errorf("ожидалась подсказка Usage, получено: %q", out)
	}
}

func TestTooManyArgumentsShowsUsage(t *testing.T) {
	out, code := run(t, "a", "b", "c")
	if code != 1 {
		t.Errorf("ожидался код выхода 1, получено %d", code)
	}
	if !strings.Contains(out, "Usage") {
		t.Errorf("ожидалась подсказка Usage, получено: %q", out)
	}
}

func TestNonexistentFont(t *testing.T) {
	out, code := run(t, "Hi", "no_such_font")
	if code != 1 {
		t.Errorf("ожидался код выхода 1, получено %d", code)
	}
	if !strings.Contains(out, "Error loading font") {
		t.Errorf("ожидалась ошибка загрузки шрифта, получено: %q", out)
	}
}

func TestUnsupportedCharacter(t *testing.T) {
	out, code := run(t, "café")
	if code != 1 {
		t.Errorf("ожидался код выхода 1, получено %d", code)
	}
	if !strings.Contains(out, "Error") {
		t.Errorf("ожидалось сообщение об ошибке, получено: %q", out)
	}
}
