import { describe, expect, test } from 'bun:test'
import { fallbackGroupHomepage } from './activities.ts'

describe('fallbackGroupHomepage', () => {
  test('derives the public groups URL for a missing homepage', () => {
    expect(
      fallbackGroupHomepage(
        'https://api.w3.org/groups/tf/ab-elected',
        'ab-elected',
      ),
    ).toBe('https://www.w3.org/groups/tf/ab-elected/')
    expect(
      fallbackGroupHomepage(
        'https://api.w3.org/groups/wg/lws',
        'lws',
      ),
    ).toBe('https://www.w3.org/groups/wg/lws/')
  })

  test('returns undefined without a shortname', () => {
    expect(
      fallbackGroupHomepage('https://api.w3.org/groups/tf/ab-elected', undefined),
    ).toBeUndefined()
  })
})
