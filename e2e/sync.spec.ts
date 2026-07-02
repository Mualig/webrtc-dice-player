import { test, expect, type Locator, type Page } from '@playwright/test'

// Open the side drawer and set the player's name.
async function setName(page: Page, name: string) {
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByLabel('Your name').fill(name)
}

// The roll-history rows (scoped to the History section so the roster list in the
// drawer never matches).
function history(page: Page): Locator {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'History' }) })
    .getByRole('listitem')
}

// The six die values shown in a single history row (1–6 chips, excluding the
// "#n" label and the roller name).
function diceValues(row: Locator): Promise<string[]> {
  return row.locator('span').filter({ hasText: /^[1-6]$/ }).allInnerTexts()
}

test('host and client sync dice rolls in both directions', async ({ browser }) => {
  // Separate contexts → isolated localStorage, so the two players don't share
  // a persisted name/color.
  const hostContext = await browser.newContext()
  const clientContext = await browser.newContext()
  const host = await hostContext.newPage()
  const client = await clientContext.newPage()

  // --- Host creates a room ---
  await host.goto('/')
  await setName(host, 'Alice')
  await host.getByRole('button', { name: 'Create room' }).click()
  await expect(host.getByText('Room code')).toBeVisible()

  // The invite link carries ?room=CODE; the client auto-joins from it.
  const shareLink = (await host.getByText(/\?room=/).innerText()).trim()
  expect(shareLink).toContain('?room=')
  await host.keyboard.press('Escape') // close the drawer

  // --- Client joins via the invite link ---
  await client.goto(shareLink)
  await setName(client, 'Bob')
  await expect(client.getByText(/Connected to room/)).toBeVisible()
  await client.keyboard.press('Escape')

  // Host sees the client appear in the roster.
  await host.getByRole('button', { name: 'Open menu' }).click()
  await expect(host.getByText('Bob')).toBeVisible()
  await host.keyboard.press('Escape')

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
