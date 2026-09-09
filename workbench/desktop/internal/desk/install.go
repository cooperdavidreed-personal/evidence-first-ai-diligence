package desk

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type File struct {
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}
type Manifest struct {
	Files map[string]File `json:"files"`
}
type Installation struct {
	Root   string `json:"root"`
	Digest string `json:"digest"`
}

func DataHome() (string, error) {
	if override := os.Getenv("DESK_DATA_HOME"); override != "" {
		return filepath.Abs(override)
	}
	home, err := os.UserHomeDir()
	return filepath.Join(home, ".underwriting-desk"), err
}
func Node(root string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(root, "runtime", "node.exe")
	}
	return filepath.Join(root, "runtime", "node")
}
func Load(home string) (Installation, error) {
	var v Installation
	b, e := os.ReadFile(filepath.Join(home, "desktop-install.json"))
	if e != nil {
		return v, errors.New("Open Underwriting Desk once before connecting Claude")
	}
	e = json.Unmarshal(b, &v)
	if e != nil {
		return v, e
	}
	if !filepath.IsAbs(v.Root) || len(v.Digest) != 64 || filepath.Base(v.Root) != v.Digest {
		return v, errors.New("Invalid Desk installation descriptor")
	}
	_, e = os.Stat(Node(v.Root))
	return v, e
}
func Verify(root string) error {
	b, e := os.ReadFile(filepath.Join(root, "desktop-manifest.json"))
	if e != nil {
		return e
	}
	var m Manifest
	if e = json.Unmarshal(b, &m); e != nil {
		return e
	}
	for name, expected := range m.Files {
		p, e := safePath(root, name)
		if e != nil {
			return e
		}
		info, e := os.Lstat(p)
		if e != nil {
			return e
		}
		if !info.Mode().IsRegular() || info.Size() != expected.Bytes {
			return fmt.Errorf("Invalid installed file: %s", name)
		}
		b, e := os.ReadFile(p)
		if e != nil {
			return e
		}
		sum := sha256.Sum256(b)
		if hex.EncodeToString(sum[:]) != expected.SHA256 {
			return fmt.Errorf("Damaged installed file: %s", name)
		}
	}
	return nil
}
func safePath(root, name string) (string, error) {
	if name == "" || strings.Contains(name, "\\") || strings.Contains(name, ":") || strings.HasPrefix(name, "/") {
		return "", errors.New("Unsafe archive path")
	}
	for _, part := range strings.Split(name, "/") {
		if part == ".." || part == "." {
			return "", errors.New("Unsafe archive path")
		}
	}
	return filepath.Join(root, filepath.FromSlash(name)), nil
}
func Extract(payload []byte, root string) error {
	r, e := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if e != nil {
		return e
	}
	seen := map[string]bool{}
	for _, f := range r.File {
		p, e := safePath(root, f.Name)
		if e != nil {
			return e
		}
		if seen[p] || f.Mode()&os.ModeSymlink != 0 || f.UncompressedSize64 > 512*1024*1024 {
			return errors.New("Invalid archive entry")
		}
		seen[p] = true
		if f.FileInfo().IsDir() {
			if e = os.MkdirAll(p, 0700); e != nil {
				return e
			}
			continue
		}
		if e = os.MkdirAll(filepath.Dir(p), 0700); e != nil {
			return e
		}
		reader, e := f.Open()
		if e != nil {
			return e
		}
		out, e := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			reader.Close()
			return e
		}
		_, e = io.Copy(out, reader)
		closeErr := out.Close()
		reader.Close()
		if e != nil {
			return e
		}
		if closeErr != nil {
			return closeErr
		}
		if f.Mode()&0111 != 0 {
			if e = os.Chmod(p, 0700); e != nil {
				return e
			}
		}
	}
	return Verify(root)
}
func Install(payload []byte, home string) (Installation, error) {
	sum := sha256.Sum256(payload)
	digest := hex.EncodeToString(sum[:])
	base := filepath.Join(home, "application", "versions")
	root := filepath.Join(base, digest)
	v := Installation{Root: root, Digest: digest}
	if current, e := Load(home); e == nil && current.Digest != digest && Running(home) {
		return v, errors.New("Quit the running Desk using Quit Desk, then open this update again. Your saved companies have not changed.")
	}
	if e := os.MkdirAll(base, 0700); e != nil {
		return v, e
	}
	if _, e := os.Stat(root); os.IsNotExist(e) {
		temp, e := os.MkdirTemp(base, "install-")
		if e != nil {
			return v, e
		}
		defer os.RemoveAll(temp)
		if e = Extract(payload, temp); e != nil {
			return v, e
		}
		if e = os.Rename(temp, root); e != nil {
			if ve := Verify(root); ve != nil {
				return v, e
			}
		}
	}
	if e := Verify(root); e != nil {
		return v, e
	}
	b, _ := json.Marshal(v)
	temp, e := os.CreateTemp(home, "descriptor-")
	if e != nil {
		return v, e
	}
	name := temp.Name()
	defer os.Remove(name)
	if _, e = temp.Write(b); e != nil {
		temp.Close()
		return v, e
	}
	temp.Close()
	e = os.Rename(name, filepath.Join(home, "desktop-install.json"))
	return v, e
}
