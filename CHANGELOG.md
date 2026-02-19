# CHANGELOG

## v1.3.0

- Feat(react/vue): Support new props: `as` / `itemAs` / `itemClassName`

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
