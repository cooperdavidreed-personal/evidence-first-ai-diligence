package main

import (
	"bufio"
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"underwritingdesk/desktop/internal/desk"
)

//go:embed payload.zip
var payload []byte

func main() {
	if e := run(); e != nil {
		showError(e.Error())
		os.Exit(1)
	}
}
func run() error {
	home, e := desk.DataHome()
	if e != nil {
		return e
	}
	v, e := desk.Install(payload, home)
	if e != nil {
		return e
	}
	if len(os.Args) > 1 && os.Args[1] == "--install-only" {
		fmt.Println(v.Root)
		return nil
	}
	log, e := os.OpenFile(filepath.Join(home, "desktop.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if e != nil {
		return e
	}
	defer log.Close()
	cmd := exec.Command(desk.Node(v.Root), filepath.Join(v.Root, "desktop-start.mjs"))
	cmd.Env = append(os.Environ(), "DESK_DATA_HOME="+home)
	hide(cmd)
	cmd.Stderr = log
	stdout, e := cmd.StdoutPipe()
	if e != nil {
		return e
	}
	if e = cmd.Start(); e != nil {
		return e
	}
	scanner := bufio.NewScanner(stdout)
	if !scanner.Scan() {
		cmd.Wait()
		return fmt.Errorf("Desk could not start. Support details are in %s", filepath.Join(home, "desktop.log"))
	}
	url := scanner.Text()
	if !strings.HasPrefix(url, "http://127.0.0.1:") {
		return fmt.Errorf("Invalid local application address")
	}
	if e = desk.WriteRecovery(home, url); e != nil {
		return e
	}
	if os.Getenv("DESK_NO_OPEN") != "1" {
		if e = openURL(url); e != nil {
			return fmt.Errorf("The Desk is running at %s, but the browser did not open. Paste that address into your browser. Your saved work is intact. Browser error: %w", url, e)
		}
	}
	fmt.Println(url)
	// The browser owns the visible session. The local service remains addressable
	// through its private descriptor and the authenticated Quit Desk action.
	return cmd.Process.Release()
}
