import {
  getContributorScores,
  getContributorPercentages,
  getMaintainers,
} from "./src/github";
import fs from "fs/promises";
import path from "path";
import type { ContributorOutput } from "./src/types";

const owner = process.env.GITHUB_OWNER || "wslyvh";
const repo = process.env.GITHUB_REPO || "nexth";
const since = process.env.GITHUB_SINCE;
const top = process.env.GITHUB_TOP
  ? parseInt(process.env.GITHUB_TOP)
  : undefined;

async function writeContributorsJson(data: ContributorOutput) {
  const outputPath = path.join(
    process.cwd(),
    `${owner}-${repo}@${new Date().toISOString().split("T")[0]}.json`
  );
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
  console.log(`Data written to ${outputPath}`);
}

async function fetchContributorData() {
  const scores = await getContributorScores({ owner, repo, since, top });
  const percentages = getContributorPercentages(scores);

  const contributorData: ContributorOutput = {
    metadata: {
      repository: `${owner}/${repo}`,
      runDate: new Date().toISOString().split("T")[0],
      sinceDate: since || null,
    },
    contributors: percentages.map(({ login, score, percentage }) => ({
      login,
      score,
      percentage,
      address: "",
    })),
  };

  await writeContributorsJson(contributorData);
  return contributorData;
}

async function main() {
  try {
    console.log(
      `Fetching data for ${owner}/${repo}${since ? ` since ${since}` : ""}`
    );

    const maintainers = await getMaintainers(owner, repo);
    console.log(`Maintainers: ${maintainers.map((m) => m.login).join(", ")}`);

    const { contributors } = await fetchContributorData();
    console.log("\nContributor data written to contributors.json");

    // Log summary to console
    let totalPercentage = 0;
    contributors.forEach(({ login, score, percentage }) => {
      console.log(
        `${login}: Score ${score}, Percentage ${percentage.toFixed(2)}%`
      );
      totalPercentage += percentage;
    });
    console.log(`Total Percentage: ${totalPercentage.toFixed(2)}%`);
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
