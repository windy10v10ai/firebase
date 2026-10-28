English | [简体中文](CONTRIBUTING_ZH.md)

# Contributing to Windy10v10ai Cloud

Thanks for taking the time to contribute!

## What we welcome

- **Bug reports and suggestions**: open an [issue](https://github.com/windy10v10ai/firebase/issues/new/choose).
- **Small fixes**: typos, documentation, translations and obvious small bug fixes can go straight to a pull request.
- **New features and behavior changes**: please open an issue and discuss it first. By default the maintainer implements features, so a feature pull request without prior agreement may be closed. This saves you from building something that doesn't fit the project.

## Always open an issue first for these

Even a small change in these areas needs an issue and the maintainer's agreement before you start, because a mistake here affects real players or real money:

- Payments, membership and points (Stripe, Alipay and similar)
- Player data and data migration
- Firestore security rules (`firestore.rules`) and authentication
- Launcher release and update workflows

## Before you open a pull request

1. Search the [existing issues](https://github.com/windy10v10ai/firebase/issues) first.
2. For a feature or behavior change, open an issue that explains the problem and your idea, then wait for the maintainer to agree before you start.
3. Small fixes don't need an issue. Say what you changed and why in the pull request.

## Communication

- Join [Discord](https://discord.com/invite/MfawtDpxks)

## Contributing Code

Fork this project and [submit a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork). Contributors who were invited as project members can create a branch in this repository instead.

Branch from the latest `develop`. Branch name rule:

- Work for an issue: `feature/{issue number}-{short-summary}`
- Small fixes without an issue: `fix/{short-summary}`, `docs/{short-summary}`, `chore/{short-summary}`

See the [README](../README.md) for setup and running the local emulators.

### Pull Requests

- Create the pull request from your branch to `develop` and fill in the template.
- Link the issue with `Fixes #{issue number}`.
- For changes to the website, attach a screenshot.
- Say what you tested and what you did not. Unchecked items are fine, unverified claims are not.
- Run the checks for the part you changed before pushing. CI runs the same ones:
  - `api/`: `npm run lint`, `npm run test`
  - `web/`: `npm run lint`, `npm run format:check`, `npx tsc --noEmit`, `npm run test`, `npm run build`

### Never commit secrets

Do not commit service account files (`serviceAccount*.json`), `.env` files, API keys, tokens, passwords, Firebase admin credentials or player data, and do not paste them into issues or pull requests. If you find a security problem, contact the maintainer privately on Discord instead of opening a public issue.

## License of Contributions

This project is licensed under the **GNU GPL version 3** (with a Steam/Workshop
distribution exception — see [`LICENSE.EXCEPTIONS.md`](../LICENSE.EXCEPTIONS.md)).

By submitting a contribution (a pull request, patch, or any other code), you
agree that:

- Your contribution is licensed to the project and its users under the GPLv3, and
- You grant the project maintainer (windy) a **perpetual, irrevocable,
  non-exclusive, worldwide, royalty-free right** to relicense your contribution,
  as part of this project, under an **OSI-approved open-source license**.

You confirm that you own the necessary rights to your contribution, or have
obtained the permissions required to submit and license it. This grant applies
only to your contribution and does not alter the license or ownership of any
third-party code.
