# LCR ministering page data

Captured 2026-11-05 through the sanitized bridge from the EQ Proposed Assignments page
(`/ministering-proposed-assignments?type=EQ`). Field names only; no values. The outer container
names were hidden by the sanitizer, so paths start at the first named field.

There is no separate API call: the page embeds everything in its Next.js `__NEXT_DATA__` script
(about 850 KB). The extension can read it from the page, or fetch the page and parse that script.

## Districts (array, 3 in this ward)
- `districtName`, `districtUuid`
- `supervisorName`, `supervisorPersonUuid`, `supervisorLegacyCmisId`
- `companionships[]`

## Companionships (64 in this ward)
- `id`, `recentlyChangedDate`, `recentlyChangedDateInMilliseconds`
- `ministers[]`: `name`, `nameSort`, `personUuid`, `legacyCmisId`, `age`, `email`, `priesthoodOffice`,
  `unitOrgId`, `assignType`, `youthBasedOnAge`, `interviews[]` (`id`, `date`, `month`, `year`, `timestamp`)
- `assignments[]` (the households ministered to): `name`, `nameSort`, `personUuid`, `legacyCmisId`, `age`,
  `assignType`, `youthBasedOnAge`
- `ministerErrors[]`, `ministerWarnings[]`, `assignmentErrors[]`, `assignmentWarnings[]`

## People list (352 entries)
- `name`, `nameOrder`, `personUuid`, `legacyCmisId`, `email`, `unitOrgs[]`
- On potential ministers (167): `age`, `priesthoodOffice`, `notGenerallyAssigned`
- `spouse`: household and address details, `householdUuid`, `householdRole`, `personStatusFlags`
  (`adult`, `singleAdult`, `prospectiveElder`, `member`, …)

## Notes for the design
- `personUuid` is the stable key for people. Snapshots and categories should use it, not names.
- "Missing companion" = a companionship with one entry in `ministers[]`.
- `notGenerallyAssigned` may be LCR's own "don't assign" flag; check what sets it before relying on it.
- Interview history is in this data. Snapshots should leave it out unless it's wanted.
