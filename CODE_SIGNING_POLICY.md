# Code signing policy

Auteur's Windows builds are currently **unsigned**. A SignPath Foundation application has not been submitted or approved. No download should be described as signed until its signature has been independently verified.

If approved: Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Roles and release process

- Author, committer, reviewer and signing approver: [AllastorV](https://github.com/AllastorV), the project maintainer. External pull requests require maintainer review before merge.
- A release candidate must be built from a reviewed public source commit on a GitHub-hosted runner. The signing approver must manually approve each signing request.
- Only Auteur-owned executables may be signed with the project's subscription. Upstream components such as FFmpeg may be included under their own terms, but must not be signed as Auteur binaries.
- Signed artifacts must identify the product as Auteur and use one consistent product version. The source commit, build workflow and artifact hashes must be recorded on the release page.

## Privacy and system changes

The desktop app stores projects locally by default. It does not send project content to an Auteur service on its own. Optional collaboration transfers project data to the server the user chooses to connect to; opening an external link also makes a normal browser request. The Windows installer may create shortcuts and a `.sbp` file association; it provides an uninstaller. The portable edition does not install these integrations.

Questions about a release or suspected signing misuse can be reported through the [project's GitHub issues](https://github.com/AllastorV/auteur-app/issues).
