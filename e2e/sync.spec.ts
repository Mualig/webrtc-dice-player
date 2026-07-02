import { test, expect, type Browser, type Locator, type Page } from '@playwright/test'

// Open the side drawer and set the player's name.
async function setName(page: Page, name: string) {
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByLabel('Your name').fill(name)
}

// The list rows under the section with the given heading — scoping keeps the
// drawer's roster list (and the other feed) from matching.
function rowsUnder(page: Page, heading: string): Locator {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: heading }) })
    .getByRole('listitem')
}

// The roll-history rows, and the scorecard-activity rows (each newest first).
const history = (page: Page): Locator => rowsUnder(page, 'History')
const activity = (page: Page): Locator => rowsUnder(page, 'Scorecard activity')
// The other-players score rows.
const scoreboard = (page: Page): Locator => rowsUnder(page, 'Other players')

// The six die values shown in a single history row (1–6 chips, excluding the
// "#n" label and the roller name).
function diceValues(row: Locator): Promise<string[]> {
  return row.locator('span').filter({ hasText: /^[1-6]$/ }).allInnerTexts()
}

// Bring up a connected host (Alice) + client (Bob) in isolated contexts (so
// their localStorage — name/color/scorecard — never overlaps), returning both
// pages with the drawers closed and the roster settled.
async function connectHostAndClient(browser: Browser): Promise<{ host: Page; client: Page }> {
  const host = await (await browser.newContext()).newPage()
  const client = await (await browser.newContext()).newPage()

  // Host creates a room; the invite link carries ?room=CODE.
  await host.goto('/')
  await setName(host, 'Alice')
  await host.getByRole('button', { name: 'Create room' }).click()
  await expect(host.getByText('Room code')).toBeVisible()
  const shareLink = (await host.getByText(/\?room=/).innerText()).trim()
  expect(shareLink).toContain('?room=')
  await host.keyboard.press('Escape')

  // Client auto-joins from the invite link.
  await client.goto(shareLink)
  await setName(client, 'Bob')
  await expect(client.getByText(/Connected to room/)).toBeVisible()
  await client.keyboard.press('Escape')

  // Host sees the client in the roster before the test proceeds. Scope to the
  // menu drawer — "Bob" also appears in the on-page scoreboard.
  await host.getByRole('button', { name: 'Open menu' }).click()
  await expect(host.getByRole('dialog', { name: 'Menu' }).getByText('Bob')).toBeVisible()
  await host.keyboard.press('Escape')

  return { host, client }
}

test('host and client sync dice rolls in both directions', async ({ browser }) => {
  const { host, client } = await connectHostAndClient(browser)

  // --- Host rolls → both peers show the same roll, attributed to Alice ---
  await expect(host.getByText(/No rolls yet/)).toBeVisible()
  await host.getByRole('button', { name: 'Roll dice' }).click()

  await expect(history(host)).toHaveCount(1)
  await expect(history(client)).toHaveCount(1)
  await expect(history(client).first()).toContainText('Alice')

  // The authoritative host state means identical dice on both peers.
  const hostDice = await diceValues(history(host).first())
  expect(hostDice).toHaveLength(6)
  expect(await diceValues(history(client).first())).toEqual(hostDice)

  // --- Client rolls → the host performs it and both update, attributed to Bob ---
  await client.getByRole('button', { name: 'Roll dice' }).click()
  await expect(history(client)).toHaveCount(2)
  await expect(history(host)).toHaveCount(2)
  await expect(history(host).first()).toContainText('Bob')
})

test("scorecard moves appear in each player's activity feed", async ({ browser }) => {
  const { host, client } = await connectHostAndClient(browser)

  // --- Host crosses off a number on their own card → the shared feed on both
  // peers records it, attributed to Alice ---
  await host.getByRole('button', { name: 'red 7' }).click()
  await expect(activity(host)).toHaveCount(1)
  await expect(activity(client)).toHaveCount(1)
  await expect(activity(client).first()).toContainText('Alice')
  await expect(activity(client).first()).toContainText('crossed off red 7')

  // The client's "Other players" board shows Alice's synced total (one cross = 1).
  const aliceScore = scoreboard(client).filter({ hasText: 'Alice' })
  await expect(aliceScore).toContainText('1')

  // --- Client takes a penalty → the host sees it, attributed to Bob, newest first ---
  await client.getByRole('button', { name: 'Penalty 1' }).click()
  await expect(activity(client)).toHaveCount(2)
  await expect(activity(host)).toHaveCount(2)
  await expect(activity(host).first()).toContainText('Bob')
  await expect(activity(host).first()).toContainText('penalty')

  // --- Client undoes it → that entry is struck on both peers, not a new row ---
  await client.getByRole('button', { name: 'Undo' }).click()
  await expect(activity(client)).toHaveCount(2) // no "undid" row added
  await expect(activity(host)).toHaveCount(2)
  await expect(activity(client).first()).toHaveClass(/line-through/)
  await expect(activity(host).first()).toHaveClass(/line-through/)
})
