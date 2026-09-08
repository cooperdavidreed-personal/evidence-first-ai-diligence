package desk

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func archive(name string, data []byte) []byte {
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	f, _ := w.Create(name)
	f.Write(data)
	sum := sha256.Sum256(data)
	manifest, _ := json.Marshal(Manifest{Files: map[string]File{name: {SHA256: hex.EncodeToString(sum[:]), Bytes: int64(len(data))}}})
	f, _ = w.Create("desktop-manifest.json")
	f.Write(manifest)
	w.Close()
	return b.Bytes()
}
func TestTraversalRejected(t *testing.T) {
	for _, name := range []string{"../escape", "/absolute", "a/../../escape", "C:/escape", "a\\escape"} {
		if Extract(archive(name, []byte("test")), t.TempDir()) == nil {
			t.Fatal("accepted", name)
		}
	}
}
func TestInstallPreservesDataAndDetectsTampering(t *testing.T) {
	home := filepath.Join(t.TempDir(), "path with spaces")
	os.MkdirAll(home, 0700)
	database := filepath.Join(home, "reviews.sqlite")
	os.WriteFile(database, []byte("original"), 0600)
	payload := archive("runtime/node", []byte("binary"))
	v, e := Install(payload, home)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = Install(payload, home); e != nil {
		t.Fatal(e)
	}
	saved, _ := os.ReadFile(database)
	if string(saved) != "original" {
		t.Fatal("modified data")
	}
	os.WriteFile(filepath.Join(v.Root, "runtime/node"), []byte("broken"), 0600)
	if Verify(v.Root) == nil {
		t.Fatal("accepted tampered runtime")
	}
}
func TestSymlinkRejected(t *testing.T) {
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	header := &zip.FileHeader{Name: "bad"}
	header.SetMode(os.ModeSymlink | 0700)
	f, _ := w.CreateHeader(header)
	f.Write([]byte("/tmp/escape"))
	w.Close()
	if Extract(b.Bytes(), t.TempDir()) == nil {
		t.Fatal("accepted symlink")
	}
}
