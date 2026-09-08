package main

import (
	"os/exec"
)

func hide(cmd *exec.Cmd)       {}
func openURL(url string) error { return exec.Command("/usr/bin/open", url).Run() }
func showError(message string) {
	exec.Command("/usr/bin/osascript", "-e", `on run argv
 display alert "Underwriting Desk could not open" message (item 1 of argv) as critical
end run`, message).Run()
}
