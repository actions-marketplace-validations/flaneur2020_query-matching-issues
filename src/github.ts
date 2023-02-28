import * as core from '@actions/core'
import * as github from '@actions/github'

import { GitHub } from '@actions/github/lib/utils'

/**
 * An object containing information about a GitHub Issue.
 */
export interface Issue {
  title: string
  url: string
  labels: {
    nodes: Array<{
      name: string
    }>
  }
}

/**
 * An object containing a repository name and owner.
 */
interface NameWithOwner {
  owner: string
  repo: string
}

/**
 * Value returned from a successful GraphQL query.
 */
interface QueryResponse {
  search: {
    pageInfo: {
      endCursor: string
      hasNextPage: boolean
    }
    nodes: Issue[]
  }
}

export type GitHubClient = InstanceType<typeof GitHub>
export type GraphQlQueryResponseData = QueryResponse | null

/**
 * GraphQL query template to use to execute the search.
 */
const query = `
query($searchQuery: String!, $cursor: String) {
  search(first: 100, query: $searchQuery, type: ISSUE, after: $cursor) {
    pageInfo {
      hasNextPage,
      endCursor
    }
    nodes {
      ... on Issue {
        title
        url
        labels(first: 100) {
          nodes {
            name
          }
        }
        createdAt
      }
    }
  }
}
`

/**
 * Formats the repo name and owner into the standard string notation.
 *
 * @param nameWithOwner Repo owner and name information
 */
export function formatNameWithOwner({ owner, repo }: NameWithOwner): string {
  return `${owner}/${repo}`
}

/**
 * Gets the list of Issues that match the query.
 *
 * Takes the `searchQuery`, includes a specifier to restrict the query to the current repo,
 * and inserts it into the GraphQL search query template.
 *
 * @param token Token to use to execute the search
 * @param searchQuery Search query to execute
 */
export async function getMatchingIssues(token: string, searchQuery: string): Promise<Issue[]> {
  const client = github.getOctokit(token)
  const context = github.context
  const queryText = `repo:${formatNameWithOwner(context.repo)} ${searchQuery}`

  let cursor: string | null = null
  let hasNextPage = true
  let issues: Issue[] = []

  core.debug(`Query: ${queryText}`)

  while (hasNextPage) {
    const results: GraphQlQueryResponseData = await client.graphql(query, {
      cursor,
      searchQuery: queryText
    })

    core.debug(`Results: ${JSON.stringify(results, null, 2)}`)

    if (results) {
      cursor = results.search.pageInfo.endCursor
      issues = issues.concat(results.search.nodes.map((issue) => issue))
      hasNextPage = results.search.pageInfo.hasNextPage
    } else {
      hasNextPage = false
    }
  }

  return issues
}
