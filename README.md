# Git Author Info

Git Author Info is an easy-to-use web tool that allows you to quickly get the Git username and email address for any GitHub user profile.

> [!NOTE]
> This tool only works for public GitHub user profiles. Private profiles or users without public activity may not yield results. GHE (GitHub Enterprise) instances are not supported.

## Features

- **Shareable URLs that auto-fill the username** - would you like to share a specific user's info with someone? You can give them a link that auto-fills and queries automatically. [Here's an example for the "@octocat" account](https://agriyakhetarpal.github.io/git-author-info/?username=octocat).
- **Click to copy** - Click on the name or email to copy individually, or use the button to copy the full `Name <email>` format
- **Private email handling** - If a user's email is private, the tool automatically displays their GitHub noreply address to you
- **Multiple email addresses** - If a user has used multiple email addresses in their commits, the tool will try to find and display them all

## Usage

1. Enter a GitHub username in the input field
2. Click "Get" or press Enter to fetch the user's info
3. Copy the name and/or email address as needed by clicking on them or pressing the "Copy as `Name <email>` button

The tool displays:

- **Name**: The user's display name (or their username, if not set)
- **Email**: The user's public email address, or GitHub noreply address if private

## Why I built this

I often need to find the email addresses of open source contributors for collaboration, outreach, or giving appropriate credit as part of commit messages, such as via the `Co-authored-by` or `Suggested-by` keywords. Instead of manually digging through GitHub profiles and commit histories in repositories, I wanted a quick and easy way to get this information.

## Privacy statement

This tool makes requests directly to GitHub's public API from your browser. No data is collected, stored, or shared with any third parties.

## Contributing

Contributions of all sorts (bug reports, improvements, feedback) are welcome! Please consider opening an issue to check with me before working on something, or skip it if it's a trivial change.

To test this locally:

```console
git clone https://github.com/agriyakhetarpal/git-author-info.git
cd git-author-info
python -m http.server 4000
```

Then, open http://localhost:4000 in your browser.

## Thanks

The design is highly inspired by [Richard Si's Next PR Number][https://github.com/ichard26/next-pr-number] and [Mariatta Wijaya's "Check Python CLA"](https://github.com/Mariatta/check_python_cla) tools. Thank you so much for sharing your work with the open source community!

### Authors

- [Agriya Khetarpal](https://github.com/agriyakhetarpal)
- add your name here if you contributed!

## License

This project is licensed under the terms of [the MIT License](LICENSE). The original code was written by Richard Si, and is also licensed under the MIT License (see [LICENSE.orig](LICENSE.orig) for details).
