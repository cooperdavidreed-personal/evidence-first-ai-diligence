package desk

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecoveryAddress(t *testing.T) {
	home := t.TempDir()
	if e := WriteRecovery(home, "http://127.0.0.1:54321"); e != nil {
		t.Fatal(e)
	}
	b, e := os.ReadFile(filepath.Join(home, "Open Underwriting Desk.html"))
	if e != nil || !strings.Contains(string(b), "http://127.0.0.1:54321") {
		t.Fatal("missing recovery address", e)
	}
	for _, bad := range []string{"https://example.com", "http://127.0.0.1:54321\" onclick=\"bad", "http://localhost:54321"} {
		if WriteRecovery(home, bad) == nil {
			t.Fatal("accepted unsafe address", bad)
		}
	}
}
