package desk

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func TestUpgradeRefusesLiveDifferentVersionAndPreservesDescriptor(t *testing.T) {
	home := t.TempDir()
	old, e := Install(archive("runtime/node", []byte("old runtime")), home)
	if e != nil {
		t.Fatal(e)
	}
	token := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-desk-session") != token {
			w.WriteHeader(403)
		}
	}))
	defer server.Close()
	b, _ := json.Marshal(map[string]string{"url": server.URL, "token": token})
	os.WriteFile(filepath.Join(home, "desktop-instance.json"), b, 0600)
	if _, e = Install(archive("runtime/node", []byte("new runtime")), home); e == nil {
		t.Fatal("updated running installation")
	}
	current, e := Load(home)
	if e != nil || current.Digest != old.Digest {
		t.Fatal("changed active descriptor")
	}
	server.Close()
	next, e := Install(archive("runtime/node", []byte("new runtime")), home)
	if e != nil || next.Digest == old.Digest {
		t.Fatal("update after quit failed", e)
	}
}
