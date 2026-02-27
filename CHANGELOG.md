# CHANGELOG

## v1.4.0

**NO Breaking Change**

- Feat: Add `handleLoad` to **ref** for manual loading of items (previously only supported user scroll trigger)
- Feat: `itemKey` / `scrollToKey` now support `number` | `string`; previously only `string` was supported, which was not convenient
- Feat: Add `upOffset` for up-direction scroll restoration when the position is incorrect sometimes
- Examples: Improve example styles
- README: Add FAQ section

## v1.3.1

- Fix(all): List gets stuck when onLoadMore returns [] with sentinel still visible. Ref: [issues#7](https://github.com/suhaotian/broad-infinite-list/issues/7)
- Example(react): Add `Infinite-List-to-Detail` Demo and close [issue#6](https://github.com/suhaotian/broad-infinite-list/issues/6). Visit [demo](https://suhaotian.github.io/broad-infinite-list/?demo=news)
- Others: fix typos

---

Thanks @arv Made his first contribution 🧨🚀

## v1.3.0

- Feat(React/Vue): Support new props: `containerAs` / `as` / `itemAs` / `itemClassName` / `itemStyle`
- Feat(ReactNative): Add `ScrollViewProps` support
- Feat(All): add `getTopDistance() => number` and `getBottomDistance() => number` to ref
- Feat(React/Vue): add `headerSlot` and `footerSlot` for **table** usecase

## v1.2.3

- Fix(vue): scroll restoration not working on iOS Safari after load more

## v1.2.2

- Keep use `use-next-tick` but with `useNextTickLayout` from new version of `use-next-tick`

## v1.2.1

- Revert `use-next-tick`, This causes scroll flashing in iOS Safari.
- Fix ChatGPT and Claude demo style on iOS safari.
- Perf(react): observe child list elements `subtree: false` for better performance.

## v1.2.0

- Improve React version code to make it more robust.
- Improve React Native version code to make it more robust.
- Switch `useLayoutEffect` to the `use-next-tick` package hook.
- Add more examples, such as ChatGPT- and Claude-style themed infinite chat lists.

## v1.1.4

- Fix Vue scroll-up restore scroll behavior.

## v1.1.3

- Add e2e tests

## v1.1.2

- Revert v1.1.1: occur scroll bugs

## v1.1.1

- Minor update

## v1.1.0

- Prop `viewSize` to `viewCount`
- Update README

## v1.0.4

- Fix react code in Next.js

## v1.0.3

- Fix react code in Next.js

## v1.0.2

- Improve vue code

## v1.0.1

- Improve usage in README

## v1.0.0

- Fix size badge

## v1.0.0-alpha-3

- Add **./flow.svg** to `files` in package.json

## v1.0.0.alpha-2

- Add `vue` and `react-native` support 🎉🎉 (Check `vue-example/` and `rn-expo-example/`)

## v1.0.0.alpha-0

🥳 Publish first version 🎉
