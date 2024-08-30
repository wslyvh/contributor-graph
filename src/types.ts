export interface Contributor {
  login: string
  score: number
}

export interface ContributorMap {
  [login: string]: number
}

export interface ContributorScoreOptions {
  owner: string
  repo: string
  since?: string
  top?: number
}

export const SCORE_WEIGHTS = {
  ISSUE_CREATED: 10,
  ISSUE_COMMENT: 5,
  ISSUE_REACTION: 2,
  PR_CREATED: 20,
  PR_REVIEW: 15,
  PR_COMMENT: 10,
  PR_REACTION: 3,
}

export interface ContributorPercentage extends Contributor {
  percentage: number
}

export interface Maintainer {
  login: string
  avatarUrl: string
  htmlUrl: string
  role: string
}