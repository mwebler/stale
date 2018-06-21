const createScheduler = require('probot-scheduler')
const getConfig = require('probot-config')
const Stale = require('./lib/stale')

const IssueReporter = require('probot-report-error')
const configIssueReporter = new IssueReporter({
  title: 'Error while loading configuration file for Stale app',
  body: `An error occurred while trying to check this repository for stale issues`,
  footer: 'Check the sintax of \`.github/stale.yml\` and make sure it\'s valid. For more information check [probot/stale](https://probot.github.io/apps/stale/)',
});

module.exports = async robot => {
  // Visit all repositories to mark and sweep stale issues
  const scheduler = createScheduler(robot)

  // Unmark stale issues if a user comments
  const events = [
    'issue_comment',
    'issues',
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment'
  ]

  robot.on(events, unmark)
  robot.on('schedule.repository', markAndSweep)

  async function unmark (context) {
    if (!context.isBot) {
      const stale = await forRepository(context)
      let issue = context.payload.issue || context.payload.pull_request
      const type = context.payload.issue ? 'issues' : 'pulls'

      // Some payloads don't include labels
      if (!issue.labels) {
        try {
          issue = (await context.github.issues.get(context.issue())).data
        } catch (error) {
          context.log('Issue not found')
        }
      }

      const staleLabelAdded = context.payload.action === 'labeled' &&
        context.payload.label.name === stale.config.staleLabel

      if (stale.hasStaleLabel(type, issue) && issue.state !== 'closed' && !staleLabelAdded) {
        stale.unmark(type, issue)
      }
    }
  }

  async function markAndSweep (context) {
    const stale = await forRepository(context)
    await stale.markAndSweep('pulls')
    await stale.markAndSweep('issues')
  }

  async function forRepository (context) {
    let config;
    try{
      config = await getConfig(context, 'stale.yml')
    } catch(error){
      await configIssueReporter.createIssue(context.repo({github: context.github}), {error});
      throw error
    }

    if (!config) {
      scheduler.stop(context.payload.repository)
      // Don't actually perform for repository without a config
      config = {perform: false}
    }

    config = Object.assign(config, context.repo({logger: robot.log}))

    return new Stale(context.github, config)
  }
}
