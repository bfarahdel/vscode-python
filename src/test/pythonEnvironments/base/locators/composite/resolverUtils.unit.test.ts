// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import * as winreg from '../../../../../client/pythonEnvironments/common/windowsRegistry';
import * as externalDependencies from '../../../../../client/pythonEnvironments/common/externalDependencies';
import * as platformApis from '../../../../../client/common/utils/platform';
import {
    PythonEnvInfo,
    PythonEnvKind,
    PythonEnvSource,
    PythonVersion,
    UNKNOWN_PYTHON_VERSION,
} from '../../../../../client/pythonEnvironments/base/info';
import { buildEnvInfo } from '../../../../../client/pythonEnvironments/base/info/env';
import { InterpreterInformation } from '../../../../../client/pythonEnvironments/base/info/interpreter';
import { parseVersion } from '../../../../../client/pythonEnvironments/base/info/pythonVersion';
import { resolveEnv } from '../../../../../client/pythonEnvironments/base/locators/composite/resolverUtils';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';
import { assertEnvEqual } from '../../../discovery/locators/envTestUtils';
import { Architecture } from '../../../../../client/common/utils/platform';
import {
    AnacondaCompanyName,
    CondaInfo,
} from '../../../../../client/pythonEnvironments/discovery/locators/services/conda';

suite('Resolver Utils', () => {
    suite('Pyenv', () => {
        const testPyenvRoot = path.join(TEST_LAYOUT_ROOT, 'pyenvhome', '.pyenv');
        const testPyenvVersionsDir = path.join(testPyenvRoot, 'versions');
        setup(() => {
            sinon.stub(externalDependencies, 'getWorkspaceFolders').returns([]);
            sinon.stub(platformApis, 'getEnvironmentVariable').withArgs('PYENV_ROOT').returns(testPyenvRoot);
        });

        teardown(() => {
            sinon.restore();
        });
        function getExpectedPyenvInfo(): PythonEnvInfo | undefined {
            const envInfo = buildEnvInfo({
                kind: PythonEnvKind.Pyenv,
                executable: path.join(testPyenvVersionsDir, '3.9.0', 'bin', 'python'),
                version: {
                    major: 3,
                    minor: 9,
                    micro: 0,
                },
                source: [PythonEnvSource.Pyenv],
            });
            envInfo.display = '3.9.0:pyenv';
            envInfo.location = path.join(testPyenvVersionsDir, '3.9.0');
            envInfo.name = '3.9.0';
            return envInfo;
        }

        test('resolveEnv', async () => {
            const pythonPath = path.join(testPyenvVersionsDir, '3.9.0', 'bin', 'python');
            const expected = getExpectedPyenvInfo();

            const actual = await resolveEnv(pythonPath);
            assertEnvEqual(actual, expected);
        });
    });

    suite('Windows store', () => {
        const testLocalAppData = path.join(TEST_LAYOUT_ROOT, 'storeApps');
        const testStoreAppRoot = path.join(testLocalAppData, 'Microsoft', 'WindowsApps');

        setup(() => {
            sinon.stub(externalDependencies, 'getWorkspaceFolders').returns([]);
            sinon.stub(platformApis, 'getEnvironmentVariable').withArgs('LOCALAPPDATA').returns(testLocalAppData);
        });

        teardown(() => {
            sinon.restore();
        });

        function createExpectedInterpreterInfo(
            executable: string,
            sysVersion?: string,
            sysPrefix?: string,
            versionStr?: string,
        ): InterpreterInformation {
            let version: PythonVersion;
            try {
                version = parseVersion(versionStr ?? path.basename(executable));
                if (sysVersion) {
                    version.sysVersion = sysVersion;
                }
            } catch (e) {
                version = UNKNOWN_PYTHON_VERSION;
            }
            return {
                version,
                arch: Architecture.x64,
                executable: {
                    filename: executable,
                    sysPrefix: sysPrefix ?? '',
                    ctime: -1,
                    mtime: -1,
                },
            };
        }

        test('resolveEnv', async () => {
            const python38path = path.join(testStoreAppRoot, 'python3.8.exe');
            const expected = {
                display: undefined,
                searchLocation: undefined,
                name: '',
                location: '',
                kind: PythonEnvKind.WindowsStore,
                distro: { org: 'Microsoft' },
                source: [PythonEnvSource.PathEnvVar],
                ...createExpectedInterpreterInfo(python38path),
            };

            const actual = await resolveEnv(python38path);

            assertEnvEqual(actual, expected);
        });

        test('resolveEnv(string): forbidden path', async () => {
            const python38path = path.join(testLocalAppData, 'Program Files', 'WindowsApps', 'python3.8.exe');
            const expected = {
                display: undefined,
                searchLocation: undefined,
                name: '',
                location: '',
                kind: PythonEnvKind.WindowsStore,
                distro: { org: 'Microsoft' },
                source: [PythonEnvSource.PathEnvVar],
                ...createExpectedInterpreterInfo(python38path),
            };

            const actual = await resolveEnv(python38path);

            assertEnvEqual(actual, expected);
        });
    });

    suite('Conda', () => {
        const condaPrefixNonWindows = path.join(TEST_LAYOUT_ROOT, 'conda2');
        const condaPrefixWindows = path.join(TEST_LAYOUT_ROOT, 'conda1');
        function condaInfo(condaPrefix: string): CondaInfo {
            return {
                conda_version: '4.8.0',
                python_version: '3.9.0',
                'sys.version': '3.9.0',
                'sys.prefix': '/some/env',
                root_prefix: condaPrefix,
                envs: [condaPrefix],
            };
        }

        function expectedEnvInfo(executable: string, location: string) {
            const info = buildEnvInfo({
                executable,
                kind: PythonEnvKind.Conda,
                org: AnacondaCompanyName,
                location,
                source: [PythonEnvSource.Conda],
                version: UNKNOWN_PYTHON_VERSION,
                fileInfo: undefined,
                name: 'base',
            });
            return info;
        }
        function createSimpleEnvInfo(
            interpreterPath: string,
            kind: PythonEnvKind,
            version: PythonVersion = UNKNOWN_PYTHON_VERSION,
            name = '',
            location = '',
        ): PythonEnvInfo {
            return {
                name,
                location,
                kind,
                executable: {
                    filename: interpreterPath,
                    sysPrefix: '',
                    ctime: -1,
                    mtime: -1,
                },
                display: undefined,
                version,
                arch: Architecture.Unknown,
                distro: { org: '' },
                searchLocation: undefined,
                source: [],
            };
        }

        setup(() => {
            sinon.stub(externalDependencies, 'getWorkspaceFolders').returns([]);
        });

        teardown(() => {
            sinon.restore();
        });

        test('resolveEnv (Windows)', async () => {
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Windows);
            sinon.stub(externalDependencies, 'exec').callsFake(async (command: string, args: string[]) => {
                if (command === 'conda' && args[0] === 'info' && args[1] === '--json') {
                    return { stdout: JSON.stringify(condaInfo(condaPrefixWindows)) };
                }
                throw new Error(`${command} is missing or is not executable`);
            });
            const actual = await resolveEnv(path.join(TEST_LAYOUT_ROOT, 'conda1', 'python.exe'));
            assertEnvEqual(actual, expectedEnvInfo(path.join(condaPrefixWindows, 'python.exe'), condaPrefixWindows));
        });

        test('resolveEnv (non-Windows)', async () => {
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Linux);
            sinon.stub(externalDependencies, 'exec').callsFake(async (command: string, args: string[]) => {
                if (command === 'conda' && args[0] === 'info' && args[1] === '--json') {
                    return { stdout: JSON.stringify(condaInfo(condaPrefixNonWindows)) };
                }
                throw new Error(`${command} is missing or is not executable`);
            });
            const actual = await resolveEnv(path.join(TEST_LAYOUT_ROOT, 'conda2', 'bin', 'python'));
            assertEnvEqual(
                actual,
                expectedEnvInfo(path.join(condaPrefixNonWindows, 'bin', 'python'), condaPrefixNonWindows),
            );
        });

        test('resolveEnv: If no conda binary found, resolve as a simple environment', async () => {
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Windows);
            sinon.stub(externalDependencies, 'exec').callsFake(async (command: string) => {
                throw new Error(`${command} is missing or is not executable`);
            });
            const actual = await resolveEnv(path.join(TEST_LAYOUT_ROOT, 'conda1', 'python.exe'));
            assertEnvEqual(
                actual,
                createSimpleEnvInfo(
                    path.join(TEST_LAYOUT_ROOT, 'conda1', 'python.exe'),
                    PythonEnvKind.Conda,
                    undefined,
                    'conda1',
                    path.join(TEST_LAYOUT_ROOT, 'conda1'),
                ),
            );
        });
    });

    suite('Simple envs', () => {
        const testVirtualHomeDir = path.join(TEST_LAYOUT_ROOT, 'virtualhome');
        setup(() => {
            sinon.stub(externalDependencies, 'getWorkspaceFolders').returns([testVirtualHomeDir]);
        });

        teardown(() => {
            sinon.restore();
        });

        function createExpectedEnvInfo(
            interpreterPath: string,
            kind: PythonEnvKind,
            version: PythonVersion = UNKNOWN_PYTHON_VERSION,
            name = '',
            location = '',
        ): PythonEnvInfo {
            return {
                name,
                location,
                kind,
                executable: {
                    filename: interpreterPath,
                    sysPrefix: '',
                    ctime: -1,
                    mtime: -1,
                },
                display: undefined,
                version,
                arch: Architecture.Unknown,
                distro: { org: '' },
                searchLocation: Uri.file(path.dirname(location)),
                source: [],
            };
        }

        test('resolveEnv', async () => {
            const expected = createExpectedEnvInfo(
                path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'),
                PythonEnvKind.Venv,
                undefined,
                'win1',
                path.join(testVirtualHomeDir, '.venvs', 'win1'),
            );
            const actual = await resolveEnv(path.join(testVirtualHomeDir, '.venvs', 'win1', 'python.exe'));
            assertEnvEqual(actual, expected);
        });
    });

    suite('Windows registry', () => {
        const regTestRoot = path.join(TEST_LAYOUT_ROOT, 'winreg');

        const registryData = {
            x64: {
                HKLM: [
                    {
                        key: '\\SOFTWARE\\Python',
                        values: { '': '' },
                        subKeys: ['\\SOFTWARE\\Python\\PythonCore', '\\SOFTWARE\\Python\\ContinuumAnalytics'],
                    },
                    {
                        key: '\\SOFTWARE\\Python\\PythonCore',
                        values: {
                            '': '',
                            DisplayName: 'Python Software Foundation',
                            SupportUrl: 'www.python.org',
                        },
                        subKeys: ['\\SOFTWARE\\Python\\PythonCore\\3.9'],
                    },
                    {
                        key: '\\SOFTWARE\\Python\\PythonCore\\3.9',
                        values: {
                            '': '',
                            DisplayName: 'Python 3.9 (64-bit)',
                            SupportUrl: 'www.python.org',
                            SysArchitecture: '64bit',
                            SysVersion: '3.9',
                            Version: '3.9.0rc2',
                        },
                        subKeys: ['\\SOFTWARE\\Python\\PythonCore\\3.9\\InstallPath'],
                    },
                    {
                        key: '\\SOFTWARE\\Python\\PythonCore\\3.9\\InstallPath',
                        values: {
                            '': '',
                            ExecutablePath: path.join(regTestRoot, 'py39', 'python.exe'),
                        },
                        subKeys: [] as string[],
                    },
                    {
                        key: '\\SOFTWARE\\Python\\ContinuumAnalytics',
                        values: {
                            '': '',
                        },
                        subKeys: ['\\SOFTWARE\\Python\\ContinuumAnalytics\\Anaconda38-64'],
                    },
                    {
                        key: '\\SOFTWARE\\Python\\ContinuumAnalytics\\Anaconda38-64',
                        values: {
                            '': '',
                            DisplayName: 'Anaconda py38_4.8.3',
                            SupportUrl: 'github.com/continuumio/anaconda-issues',
                            SysArchitecture: '64bit',
                            SysVersion: '3.8',
                            Version: 'py38_4.8.3',
                        },
                        subKeys: ['\\SOFTWARE\\Python\\PythonCore\\Anaconda38-64\\InstallPath'],
                    },
                    {
                        key: '\\SOFTWARE\\Python\\PythonCore\\Anaconda38-64\\InstallPath',
                        values: {
                            '': '',
                            ExecutablePath: path.join(regTestRoot, 'conda3', 'python.exe'),
                        },
                        subKeys: [] as string[],
                    },
                ],
                HKCU: [],
            },
            x86: {
                HKLM: [],
                HKCU: [
                    {
                        key: '\\SOFTWARE\\Python',
                        values: { '': '' },
                        subKeys: ['\\SOFTWARE\\Python\\PythonCodingPack'],
                    },
                    {
                        key: '\\SOFTWARE\\Python\\PythonCodingPack',
                        values: {
                            '': '',
                            DisplayName: 'Python Software Foundation',
                            SupportUrl: 'www.python.org',
                        },
                        subKeys: ['\\SOFTWARE\\Python\\PythonCodingPack\\3.8'],
                    },
                    {
                        key: '\\SOFTWARE\\Python\\PythonCodingPack\\3.8',
                        values: {
                            '': '',
                            DisplayName: 'Python 3.8 (32-bit)',
                            SupportUrl: 'www.python.org',
                            SysArchitecture: '32bit',
                            SysVersion: '3.8.5',
                        },
                        subKeys: ['\\SOFTWARE\\Python\\PythonCodingPack\\3.8\\InstallPath'],
                    },
                    {
                        key: '\\SOFTWARE\\Python\\PythonCodingPack\\3.8\\InstallPath',
                        values: {
                            '': '',
                            ExecutablePath: path.join(regTestRoot, 'python38', 'python.exe'),
                        },
                        subKeys: [] as string[],
                    },
                ],
            },
        };

        function fakeRegistryValues({ arch, hive, key }: winreg.Options): Promise<winreg.IRegistryValue[]> {
            const regArch = arch === 'x86' ? registryData.x86 : registryData.x64;
            const regHive = hive === winreg.HKCU ? regArch.HKCU : regArch.HKLM;
            for (const k of regHive) {
                if (k.key === key) {
                    const values: winreg.IRegistryValue[] = [];
                    for (const [name, value] of Object.entries(k.values)) {
                        values.push({
                            arch: arch ?? 'x64',
                            hive: hive ?? winreg.HKLM,
                            key: k.key,
                            name,
                            type: winreg.REG_SZ,
                            value: value ?? '',
                        });
                    }
                    return Promise.resolve(values);
                }
            }
            return Promise.resolve([]);
        }

        function fakeRegistryKeys({ arch, hive, key }: winreg.Options): Promise<winreg.IRegistryKey[]> {
            const regArch = arch === 'x86' ? registryData.x86 : registryData.x64;
            const regHive = hive === winreg.HKCU ? regArch.HKCU : regArch.HKLM;
            for (const k of regHive) {
                if (k.key === key) {
                    const keys = k.subKeys.map((s) => ({
                        arch: arch ?? 'x64',
                        hive: hive ?? winreg.HKLM,
                        key: s,
                    }));
                    return Promise.resolve(keys);
                }
            }
            return Promise.resolve([]);
        }

        setup(async () => {
            sinon.stub(winreg, 'readRegistryValues').callsFake(fakeRegistryValues);
            sinon.stub(winreg, 'readRegistryKeys').callsFake(fakeRegistryKeys);
            sinon.stub(externalDependencies, 'getWorkspaceFolders').returns([]);
            sinon.stub(platformApis, 'getOSType').callsFake(() => platformApis.OSType.Windows);
        });

        teardown(() => {
            sinon.restore();
        });

        test('If data provided by registry is more informative than kind resolvers, use it to update environment (64bit)', async () => {
            const interpreterPath = path.join(regTestRoot, 'py39', 'python.exe');
            const actual = await resolveEnv(interpreterPath);
            const expected = buildEnvInfo({
                location: path.join(regTestRoot, 'py39'),
                kind: PythonEnvKind.OtherGlobal, // Environment should be marked as "Global" instead of "Unknown".
                executable: interpreterPath,
                version: parseVersion('3.9.0rc2'), // Registry provides more complete version info.
                arch: Architecture.x64,
                org: 'PythonCore',
                name: 'py39',
                source: [PythonEnvSource.WindowsRegistry],
            });
            expected.distro.defaultDisplayName = 'Python 3.9 (64-bit)';
            assertEnvEqual(actual, expected);
        });

        test('If data provided by registry is more informative than kind resolvers, use it to update environment (32bit)', async () => {
            const interpreterPath = path.join(regTestRoot, 'python38', 'python.exe');
            const actual = await resolveEnv(interpreterPath);
            const expected = buildEnvInfo({
                location: path.join(regTestRoot, 'python38'),
                kind: PythonEnvKind.OtherGlobal, // Environment should be marked as "Global" instead of "Unknown".
                executable: interpreterPath,
                version: parseVersion('3.8.5'), // Registry provides more complete version info.
                arch: Architecture.x86, // Provided by registry
                org: 'PythonCodingPack', // Provided by registry
                name: 'python38',
                source: [PythonEnvSource.WindowsRegistry],
            });
            expected.distro.defaultDisplayName = 'Python 3.8 (32-bit)';
            assertEnvEqual(actual, expected);
        });

        test('If data provided by registry is less informative than kind resolvers, do not use it to update environment', async () => {
            const interpreterPath = path.join(regTestRoot, 'conda3', 'python.exe');
            const actual = await resolveEnv(interpreterPath);
            const expected = buildEnvInfo({
                location: path.join(regTestRoot, 'conda3'),
                // Environment should already be marked as Conda. No need to update it to Global.
                kind: PythonEnvKind.Conda,
                executable: interpreterPath,
                // Registry does not provide the minor version, so keep version provided by Conda resolver instead.
                version: parseVersion('3.8.5'),
                arch: Architecture.x64, // Provided by registry
                org: 'ContinuumAnalytics', // Provided by registry
                name: 'conda3',
                source: [PythonEnvSource.WindowsRegistry],
            });
            expected.distro.defaultDisplayName = 'Anaconda py38_4.8.3';
            assertEnvEqual(actual, expected);
        });
    });
});
