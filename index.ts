import { getContributorScores, getContributorPercentages, getMaintainers } from "./src/github"

const owner = process.env.GITHUB_OWNER || "wslyvh"
const repo = process.env.GITHUB_REPO || "nexth"
const since = process.env.GITHUB_SINCE
const top = process.env.GITHUB_TOP ? parseInt(process.env.GITHUB_TOP) : undefined

console.log(`Fetching data for ${owner}/${repo}${since ? ` since ${since}` : ""}`)

async function fetchMaintainers() {
  const maintainers = await getMaintainers(owner, repo)
  console.log(`Maintainers: ${maintainers.map(m => m.login).join(', ')}`)
}

async function fetchContributorScores() {
  const scores = await getContributorScores({ owner, repo, since, top })
  const percentages = getContributorPercentages(scores)

  console.log("\nContributor Scores and Percentages:")
  let totalPercentage = 0
  percentages.forEach(({ login, score, percentage }) => {
    console.log(`${login}: Score ${score}, Percentage ${percentage.toFixed(2)}%`)
    totalPercentage += percentage
  })
  console.log(`Total Percentage: ${totalPercentage.toFixed(2)}%`)
}

async function main() {
  try {
    await fetchMaintainers()
    await fetchContributorScores()
  } catch (error) {
    console.error("An error occurred:", error)
  }
}

main()