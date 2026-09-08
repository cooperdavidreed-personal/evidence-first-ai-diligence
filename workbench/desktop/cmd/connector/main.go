package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"underwritingdesk/desktop/internal/desk"
)

func main() {
	home, e := desk.DataHome()
	if e != nil {
		fail(e)
	}
	v, e := desk.Load(home)
	if e != nil {
		fail(e)
	}
	if e = desk.Verify(v.Root); e != nil {
		fail(e)
	}
	cmd := exec.Command(desk.Node(v.Root), filepath.Join(v.Root, "mcp-server", "server.mjs"), "--review-store", filepath.Join(home, "reviews.sqlite"))
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if e = cmd.Run(); e != nil {
		fail(e)
	}
}
func fail(e error) { fmt.Fprintln(os.Stderr, e); os.Exit(1) }
