package main

import (
	"ascii-art/banner"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) != 2 && len(os.Args) != 3 {
		printUsage()
		os.Exit(1)
	}

	text := os.Args[1]

	fontName := "standard"
	if len(os.Args) == 3 {
		fontName = os.Args[2]
	}

	fontPath := fontName + ".txt"
	font, err := banner.LoadFont(fontPath)
	if err != nil {
		fmt.Println("Error loading font:", err)
		os.Exit(1)
	}

	result, err := banner.Render(text, font)
	if err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}

	fmt.Print(result)
}

func printUsage() {
	fmt.Println("Usage: go run . [STRING] [BANNER]")
	fmt.Println("EX: go run . something standard")
}
