package desk

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

// Only probe the recorded loopback endpoint with its existing private session token.
func Running(home string) bool {
	var v struct {
		URL   string `json:"url"`
		Token string `json:"token"`
	}
	b, e := os.ReadFile(filepath.Join(home, "desktop-instance.json"))
	if e != nil || json.Unmarshal(b, &v) != nil {
		return false
	}
	if !regexp.MustCompile(`^http://127\.0\.0\.1:[0-9]{1,5}$`).MatchString(v.URL) || len(v.Token) != 64 {
		return false
	}
	req, e := http.NewRequest("GET", v.URL+"/__desk/desktop", nil)
	if e != nil {
		return false
	}
	req.Header.Set("x-desk-session", v.Token)
	client := &http.Client{Timeout: 1500 * time.Millisecond, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	response, e := client.Do(req)
	if e != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode == 200
}
