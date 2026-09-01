import { describe, it, expect } from 'vitest';
import { isExactNpmVersion, checkPackageJson, checkCsproj } from '../check-pins.mjs';

// governance.md §10 Provenance:
//   "All third-party dependencies must utilize explicit version locking. No open-ended
//    wildcard version range specs are permitted (^ or ~ are banned)."

describe('isExactNpmVersion', () => {
  it.each([
    ['1.2.3', true],
    ['0.0.1', true],
    ['1.2.3-beta.1', true],
    ['1.2.3-rc.0+build.5', true],
  ])('accepts the exact version %s', (spec, expected) => {
    expect(isExactNpmVersion(spec)).toBe(expected);
  });

  it.each([
    ['^1.2.3', 'caret range'],
    ['~1.2.3', 'tilde range'],
    ['1.2.x', 'wildcard patch'],
    ['1.x', 'wildcard minor'],
    ['*', 'bare wildcard'],
    ['latest', 'dist-tag'],
    ['>=1.0.0', 'gte range'],
    ['<2.0.0', 'lt range'],
    ['1.0.0 || 2.0.0', 'alternation'],
    ['>=1.0.0 <2.0.0', 'compound range'],
    ['', 'empty spec'],
  ])('rejects %s (%s)', (spec) => {
    expect(isExactNpmVersion(spec)).toBe(false);
  });
});

describe('checkPackageJson', () => {
  it('returns no violations when every dependency is exact-pinned', () => {
    const pkg = {
      dependencies: { react: '19.0.0' },
      devDependencies: { vitest: '4.1.11' },
    };
    expect(checkPackageJson(pkg, 'package.json')).toEqual([]);
  });

  it('flags a caret range and names the offending package and spec', () => {
    const pkg = { dependencies: { react: '^19.0.0' } };
    const violations = checkPackageJson(pkg, 'package.json');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: 'package.json',
      name: 'react',
      spec: '^19.0.0',
    });
    // The reason has to be actionable on its own — it is printed without context.
    expect(violations[0].reason).toMatch(/caret|range|exact/i);
  });

  it('scans devDependencies, peerDependencies and optionalDependencies too', () => {
    const pkg = {
      devDependencies: { vitest: '~4.1.11' },
      peerDependencies: { react: '*' },
      optionalDependencies: { fsevents: 'latest' },
    };
    const violations = checkPackageJson(pkg, 'package.json');

    expect(violations).toHaveLength(3);
    expect(violations.map((v) => v.name).sort()).toEqual(['fsevents', 'react', 'vitest']);
  });

  it('tolerates a package.json with no dependency blocks at all', () => {
    expect(checkPackageJson({ name: 'x' }, 'package.json')).toEqual([]);
  });
});

describe('checkCsproj', () => {
  it('accepts an exact PackageReference version', () => {
    const xml = `<Project><ItemGroup>
      <PackageReference Include="Moq" Version="4.20.72" />
    </ItemGroup></Project>`;
    expect(checkCsproj(xml, 'Api.Tests.csproj')).toEqual([]);
  });

  it('flags a NuGet floating version', () => {
    const xml = `<Project><ItemGroup>
      <PackageReference Include="Moq" Version="4.20.*" />
    </ItemGroup></Project>`;
    const violations = checkCsproj(xml, 'Api.Tests.csproj');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ name: 'Moq', spec: '4.20.*' });
  });

  it('flags a NuGet bracket range', () => {
    const xml = `<Project><ItemGroup>
      <PackageReference Include="Serilog" Version="[2.0,3.0)" />
    </ItemGroup></Project>`;
    expect(checkCsproj(xml, 'Api.csproj')).toHaveLength(1);
  });

  it('flags a PackageReference carrying no Version attribute', () => {
    const xml = `<Project><ItemGroup>
      <PackageReference Include="Unpinned" />
    </ItemGroup></Project>`;
    const violations = checkCsproj(xml, 'Api.csproj');

    expect(violations).toHaveLength(1);
    expect(violations[0].name).toBe('Unpinned');
    expect(violations[0].reason).toMatch(/version/i);
  });

  it('reads the Version child-element form as well as the attribute form', () => {
    const xml = `<Project><ItemGroup>
      <PackageReference Include="Widget"><Version>^1.0.0</Version></PackageReference>
    </ItemGroup></Project>`;
    const violations = checkCsproj(xml, 'Api.csproj');

    expect(violations).toHaveLength(1);
    expect(violations[0].spec).toBe('^1.0.0');
  });
});
