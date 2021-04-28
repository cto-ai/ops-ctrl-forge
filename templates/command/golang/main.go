package main

import (
	"fmt"

	ctoai "github.com/cto-ai/sdk-go"
)

func main() {
	client := ctoai.NewClient()

	repo, err := client.Prompt.Input("repo", "Which application do you want to deploy?", ctoai.OptInputAllowEmpty(false))
	if err != nil {
		panic(err)
	}

	event := map[string]interface{}{
		"event_name":   "deployment",
		"event_action": "succeeded",
		"branch":       "main",
		"repo":         repo,
	}

	err = client.Sdk.Track([]string{}, "", event)
	if err != nil {
		panic(err)
	}

	err = client.Ux.Print(fmt.Sprintf("🚀 %s's successful deployment has been recorded!", repo))
	if err != nil {
		panic(err)
	}
}
