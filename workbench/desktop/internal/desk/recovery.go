package desk

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

// This file contains only a loopback address, never the private session token.
// It provides a readable fallback when the OS browser handoff is not visible.
func WriteRecovery(home, url string) error {
	if !regexp.MustCompile(`^http://127\.0\.0\.1:[0-9]{1,5}$`).MatchString(url) {
		return fmt.Errorf("Invalid local recovery address")
	}
	body := fmt.Sprintf(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Open Underwriting Desk</title><style>body{max-width:640px;margin:64px auto;padding:24px;font:16px/1.6 system-ui;color:#243448}a{color:#235c8a}</style><h1>Open Underwriting Desk</h1><p>The Desk opens in your browser. If its tab did not appear, follow this link or copy the address into a browser you already have open.</p><p><a href="%s">Open my workspace</a></p><p>%s</p><p>This address works while the Desk is running. Reopen the application to start it again. Closing the browser tab does not quit the Desk.</p></html>`, url, url)
	return os.WriteFile(filepath.Join(home, "Open Underwriting Desk.html"), []byte(body), 0600)
}
