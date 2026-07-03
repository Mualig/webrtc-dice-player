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

  // The client's roster tags who hosts the room, and who they are themselves.
  const clientMenu = client.getByRole('dialog', { name: 'Menu' })
  await client.getByRole('button', { name: 'Open menu' }).click()
  await expect(clientMenu.getByRole('listitem').filter({ hasText: 'Alice' })).toContainText('(host)')
  await expect(clientMenu.getByRole('listitem').filter({ hasText: 'Bob' })).toContainText('(you)')

  // The menu footer links to the project's GitHub repo, opening in a new tab.
  const github = clientMenu.getByRole('link', { name: 'View the project on GitHub' })
  await expect(github).toHaveAttribute('href', 'https://github.com/Mualig/webrtc-dice-player')
  await expect(github).toHaveAttribute('target', '_blank')
  await client.keyboard.press('Escape')

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

test('locking a row takes that color out of play for everyone', async ({ browser }) => {
  const { host, client } = await connectHostAndClient(browser)

  // Host locks red: five crosses satisfy the threshold, then cross the lock.
  for (const n of [2, 3, 4, 5, 6]) await host.getByRole('button', { name: `red ${n}` }).click()
  await host.getByRole('button', { name: 'Lock red row' }).click()

  // The client's own red row is now closed — its cells and lock are disabled —
  // even though the client never touched red.
  await expect(client.getByRole('button', { name: 'red 9' })).toBeDisabled()
  await expect(client.getByRole('button', { name: 'Lock red row' })).toBeDisabled()

  // The red die is out of play (greyed + labelled) on both peers.
  await expect(client.getByText('red · locked')).toBeVisible()
  await expect(host.getByText('red · locked')).toBeVisible()

  // Undoing the lock re-opens the color everywhere.
  await host.getByRole('button', { name: 'Undo' }).click()
  await expect(client.getByRole('button', { name: 'red 9' })).toBeEnabled()
  await expect(client.getByText('red · locked')).toHaveCount(0)
})

test('the game ends for everyone when a player takes a fourth penalty', async ({ browser }) => {
  const { host, client } = await connectHostAndClient(browser)

  // Host takes four penalties, one at a time — the fourth ends the game.
  for (const n of [1, 2, 3, 4]) await host.getByRole('button', { name: `Penalty ${n}` }).click()

  // Both peers reach game over, and the board + roll are frozen on the client.
  await expect(host.getByText('Game over')).toBeVisible()
  await expect(client.getByText('Game over')).toBeVisible()
  await expect(client.getByRole('button', { name: 'Roll dice' })).toBeDisabled()
  await expect(client.getByRole('button', { name: 'red 2' })).toBeDisabled()

  // The game-over banner ranks every player by final score: Bob (0) leads Alice,
  // who is at −20 from the four penalties.
  const board = client.getByRole('status')
  const rows = board.getByRole('listitem')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Bob') // leader
  await expect(rows.last()).toContainText('Alice')
  await expect(rows.last()).toContainText('-20')

  // The finished game is recorded to the local history — a full-screen view
  // opened from the menu (which closes itself), winner first.
  const hostHistory = host.getByRole('dialog', { name: 'Game history' })
  await host.getByRole('button', { name: 'Open menu' }).click()
  await host.getByRole('button', { name: 'Game history · 1' }).click()
  await expect(hostHistory).toContainText('🏆 Bob 0')
  await expect(hostHistory).toContainText('Alice (you) -20')
  await hostHistory.getByRole('button', { name: 'Close' }).click() // back to the game
  await expect(hostHistory).toHaveCount(0)

  // Taking the penalty back resumes the game for everyone.
  await host.getByRole('button', { name: 'Undo' }).click()
  await expect(host.getByText('Game over')).toHaveCount(0)
  await expect(client.getByText('Game over')).toHaveCount(0)
  await expect(client.getByRole('button', { name: 'red 2' })).toBeEnabled()

  // …and the record of the un-ended game is dropped from the history again.
  await host.getByRole('button', { name: 'Open menu' }).click()
  await host.getByRole('button', { name: 'Game history' }).click()
  await expect(hostHistory).toContainText('No finished games yet.')
  await hostHistory.getByRole('button', { name: 'Close' }).click()
})

test('anyone can start a new game, resetting the room', async ({ browser }) => {
  const { host, client } = await connectHostAndClient(browser)

  // Host builds a score and ends the game with a fourth penalty (one at a time).
  await host.getByRole('button', { name: 'red 7' }).click()
  for (const n of [1, 2, 3, 4]) await host.getByRole('button', { name: `Penalty ${n}` }).click()
  await expect(host.getByText('Game over')).toBeVisible()
  await expect(client.getByText('Game over')).toBeVisible()

  // The client (not the host) starts a new game from the banner — it resets for
  // everyone. (Scope to the banner: the menu also has a "New game" button.)
  await client.getByRole('status').getByRole('button', { name: 'New game' }).click()

  // The game-over banner clears on both peers…
  await expect(host.getByText('Game over')).toHaveCount(0)
  await expect(client.getByText('Game over')).toHaveCount(0)
  // …the host's card is wiped (penalty and cross gone) and play resumes.
  await expect(host.getByRole('button', { name: 'Penalty 1' })).toHaveAttribute('aria-pressed', 'false')
  await expect(host.getByRole('button', { name: 'red 7' })).toHaveAttribute('aria-pressed', 'false')
  await expect(host.getByRole('button', { name: 'Roll dice' })).toBeEnabled()
  await expect(client.getByRole('button', { name: 'Roll dice' })).toBeEnabled()
  await expect(client.getByRole('button', { name: 'red 2' })).toBeEnabled()

  // Starting a new game commits the record — the finished game stays in the
  // history on every peer (here the client, who sees itself as "you").
  const clientHistory = client.getByRole('dialog', { name: 'Game history' })
  await client.getByRole('button', { name: 'Open menu' }).click()
  await client.getByRole('button', { name: 'Game history · 1' }).click()
  await expect(clientHistory).toContainText('🏆 Bob (you) 0')

  // The row's X removes the game from this device's history.
  await clientHistory.getByRole('button', { name: /Remove the game/ }).click()
  await expect(clientHistory).toContainText('No finished games yet.')
  await clientHistory.getByRole('button', { name: 'Close' }).click()
  await expect(clientHistory).toHaveCount(0)
})

test('the menu "New game" resets the room mid-game', async ({ browser }) => {
  const { host, client } = await connectHostAndClient(browser)

  // Both players make a mark — a game is in progress (not over).
  await host.getByRole('button', { name: 'red 7' }).click()
  await client.getByRole('button', { name: 'yellow 3' }).click()
  await expect(host.getByRole('button', { name: 'red 7, crossed off' })).toBeVisible()

  // Host starts a new game from the menu, which asks to confirm first.
  await host.getByRole('button', { name: 'Open menu' }).click()
  const menu = host.getByRole('dialog', { name: 'Menu' })
  await menu.getByRole('button', { name: 'New game' }).click() // opens the confirmation
  await menu.getByRole('button', { name: 'New game' }).click() // confirms

  // The menu auto-closes, and both players' cards are wiped.
  await expect(host.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false')
  await expect(host.getByRole('button', { name: 'red 7' })).toHaveAttribute('aria-pressed', 'false')
  await expect(client.getByRole('button', { name: 'yellow 3' })).toHaveAttribute('aria-pressed', 'false')
})
