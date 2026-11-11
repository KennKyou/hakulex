import { navGroups } from './nav'

/*
 * Every page of the site by its path, home first: the navigation's sections and the pages
 * under them. The sitemap is written from this, so a page added to the navigation is in it.
 */
export function sitePaths(): string[] {
  const paths = navGroups.flatMap(group => group.sections.flatMap(section => [
    section.path,
    ...(section.tree ?? []).flatMap(part => part.items.map(item => item.path)),
  ]))
  return [
    ...new Set(['/', ...paths]),
  ]
}
