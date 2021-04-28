from cto_ai import ux, prompt, sdk

def main():
    repo = prompt.input(name="repo", message="Which application do you want to deploy?", allowEmpty=False)

    event = {
        "event_name": "deployment",
        "event_action": "succeeded",
        "branch": "main",
        "repo": repo
    }
    sdk.track([], "", event)

    ux.print(f'🚀 {repo}\'s successful deployment has been recorded!')

if __name__ == "__main__":
    main()
