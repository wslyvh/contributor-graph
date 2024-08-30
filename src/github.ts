import { Octokit } from "@octokit/rest"
import type { Contributor, ContributorMap, ContributorScoreOptions, ContributorPercentage, Maintainer } from "./types"
import { SCORE_WEIGHTS } from "./types"

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

const RATE_LIMIT_THRESHOLD = 100
const RATE_LIMIT_DELAY = 60000
const EXCLUDED_LOGINS = new Set(["vercel[bot]", "socket-security[bot]"])

function shouldExcludeLogin(login: string) {
  return EXCLUDED_LOGINS.has(login) || login.includes("[bot]")
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function checkRateLimit() {
  const { data } = await octokit.rateLimit.get()
  if (data.rate.remaining <= RATE_LIMIT_THRESHOLD) {
    console.log(`Approaching rate limit. Pausing for ${RATE_LIMIT_DELAY / 1000} seconds`)
    await delay(RATE_LIMIT_DELAY)
  }
}

export async function getContributorScores({
  owner,
  repo,
  since,
  top
}: ContributorScoreOptions): Promise<Contributor[]> {
  const contributors: ContributorMap = {}
  const maintainers = await getMaintainers(owner, repo)
  const maintainerLogins = new Set(maintainers.map(m => m.login))

  if (!since) {
    await checkRateLimit()
    const { data: repoData } = await octokit.repos.get({ owner, repo })
    since = repoData.created_at
  }

  await processIssuesAndPullRequests(contributors, maintainerLogins, owner, repo, since)

  const sortedContributors = Object.entries(contributors)
    .map(([login, score]) => ({ login, score }))
    .sort((a, b) => b.score - a.score)

  return top ? sortedContributors.slice(0, top) : sortedContributors
}

async function processIssuesAndPullRequests(
  contributors: ContributorMap,
  maintainerLogins: Set<string>,
  owner: string,
  repo: string,
  since: string
) {
  const issues = await fetchAllItems(octokit.issues.listForRepo, { owner, repo, state: "all", since })

  for (const item of issues) {
    if (shouldExcludeLogin(item.user.login)) continue

    const [reactions, comments] = await Promise.all([
      fetchAllItems(octokit.reactions.listForIssue, { owner, repo, issue_number: item.number }),
      fetchAllItems(octokit.issues.listComments, { owner, repo, issue_number: item.number })
    ])

    const hasThumbsDown = reactions.some(reaction => 
      maintainerLogins.has(reaction.user.login) && reaction.content === "-1"
    )

    if (!hasThumbsDown) {
      addScore(contributors, item.user.login, item.pull_request ? SCORE_WEIGHTS.PR_CREATED : SCORE_WEIGHTS.ISSUE_CREATED)
    }

    await processComments(contributors, comments, !!item.pull_request, maintainerLogins, owner, repo)
    processReactions(contributors, reactions, item.user.login, !!item.pull_request)

    if (item.pull_request) {
      const reviews = await fetchAllItems(octokit.pulls.listReviews, { owner, repo, pull_number: item.number })
      processReviews(contributors, reviews)
    }
  }
}

async function processComments(
  contributors: ContributorMap,
  comments: any[],
  isPullRequest: boolean,
  maintainerLogins: Set<string>,
  owner: string,
  repo: string
) {
  for (const comment of comments) {
    if (shouldExcludeLogin(comment.user.login)) continue

    const reactions = await fetchAllItems(octokit.reactions.listForIssueComment, { 
      owner,
      repo,
      comment_id: comment.id
    })

    const hasThumbsDown = reactions.some(reaction => 
      maintainerLogins.has(reaction.user.login) && reaction.content === "-1"
    )

    if (!hasThumbsDown) {
      addScore(contributors, comment.user.login, isPullRequest ? SCORE_WEIGHTS.PR_COMMENT : SCORE_WEIGHTS.ISSUE_COMMENT)
    }

    processReactions(contributors, reactions, comment.user.login, isPullRequest)
  }
}

function processReactions(contributors: ContributorMap, reactions: any[], itemCreator: string, isPullRequest: boolean) {
  reactions.forEach(reaction => {
    if (!shouldExcludeLogin(reaction.user.login) && 
        (reaction.content === "+1" || reaction.content === "heart" || reaction.content === "hooray")) {
      addScore(contributors, itemCreator, isPullRequest ? SCORE_WEIGHTS.PR_REACTION : SCORE_WEIGHTS.ISSUE_REACTION)
    }
  })
}

function processReviews(contributors: ContributorMap, reviews: any[]) {
  reviews.forEach(review => {
    if (!shouldExcludeLogin(review.user.login)) {
      addScore(contributors, review.user.login, SCORE_WEIGHTS.PR_REVIEW)
    }
  })
}

function addScore(contributors: ContributorMap, login: string, score: number) {
  contributors[login] = (contributors[login] || 0) + score
}

async function fetchAllItems(method: Function, params: object): Promise<any[]> {
  const items = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    await checkRateLimit()
    const { data } = await method({ ...params, page, per_page: 100 })
    items.push(...data)
    hasMore = data.length === 100
    page++
  }

  return items
}

export function getContributorPercentages(contributors: Contributor[]): ContributorPercentage[] {
  const totalScore = contributors.reduce((sum, contributor) => sum + contributor.score, 0)
  
  let percentages = contributors.map(contributor => ({
    ...contributor,
    percentage: (contributor.score / totalScore) * 100
  }))

  // Round percentages to two decimal places
  percentages = percentages.map(contributor => ({
    ...contributor,
    percentage: Math.round(contributor.percentage * 100) / 100
  }))

  // Adjust the first percentage to ensure total is exactly 100%
  const totalPercentage = percentages.reduce((sum, contributor) => sum + contributor.percentage, 0)
  if (percentages.length > 0) {
    const firstContributor = percentages[0]
    firstContributor.percentage += 100 - totalPercentage
    firstContributor.percentage = Math.round(firstContributor.percentage * 100) / 100
  }

  return percentages
}

export async function getMaintainers(owner: string, repo: string): Promise<Maintainer[]> {
  await checkRateLimit()
  const { data: collaborators } = await octokit.repos.listCollaborators({
    owner,
    repo,
    affiliation: 'all'
  })

  return collaborators
    .filter(collaborator => collaborator.permissions?.push)
    .map(collaborator => ({
      login: collaborator.login,
      avatarUrl: collaborator.avatar_url,
      htmlUrl: collaborator.html_url,
      role: collaborator.role_name || determineRole(collaborator.permissions)
    }))
}

function determineRole(permissions: any): string {
  if (permissions.admin) return 'Admin'
  if (permissions.maintain) return 'Maintainer'
  if (permissions.push) return 'Collaborator'
  return 'Contributor'
}