const { ux, sdk } = require('@cto.ai/sdk')
async function main () {
  const res = await ux.prompt({
    type: 'input',
    name: 'repo',
    message: 'Which application do you want to deploy?'
  })
  await ux.print(`🚀 ${res.repo}'s successful deployment has been recorded!`)

  const event = {
    event_name: 'deployment',
    event_action: 'succeeded',
    branch: 'main',
    repo: res.pipeline
  }
  sdk.track([], event)
}
main()
