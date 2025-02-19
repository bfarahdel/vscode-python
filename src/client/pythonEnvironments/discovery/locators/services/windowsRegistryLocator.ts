// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { traceError, traceVerbose } from '../../../../common/logger';
import { Architecture } from '../../../../common/utils/platform';
import {
    PythonEnvInfo,
    PythonEnvKind,
    PythonEnvSource,
    PythonVersion,
    UNKNOWN_PYTHON_VERSION,
} from '../../../base/info';
import { buildEnvInfo } from '../../../base/info/env';
import { parseVersion } from '../../../base/info/pythonVersion';
import { IPythonEnvsIterator, Locator } from '../../../base/locator';
import { getFileInfo } from '../../../common/externalDependencies';
import { getRegistryInterpreters, IRegistryInterpreterData } from '../../../common/windowsUtils';

function getArchitecture(data: IRegistryInterpreterData) {
    let arch = Architecture.Unknown;
    if (data.bitnessStr) {
        arch = data.bitnessStr === '32bit' ? Architecture.x86 : Architecture.x64;
    }
    return arch;
}

export class WindowsRegistryLocator extends Locator {
    private kind: PythonEnvKind = PythonEnvKind.OtherGlobal;

    public iterEnvs(): IPythonEnvsIterator {
        const buildRegistryEnvInfo = (data: IRegistryInterpreterData) => this.buildRegistryEnvInfo(data);
        const iterator = async function* () {
            const interpreters = await getRegistryInterpreters(true);
            for (const interpreter of interpreters) {
                try {
                    const env = await buildRegistryEnvInfo(interpreter);
                    yield env;
                } catch (ex) {
                    traceError(`Failed to process environment: ${interpreter}`, ex);
                }
            }
        };
        return iterator();
    }

    private async buildRegistryEnvInfo(data: IRegistryInterpreterData): Promise<PythonEnvInfo> {
        const versionStr = data.versionStr ?? data.sysVersionStr ?? data.interpreterPath;
        let version: PythonVersion = UNKNOWN_PYTHON_VERSION;

        try {
            version = parseVersion(versionStr);
        } catch (ex) {
            traceVerbose(`Failed to parse version: ${versionStr}`, ex);
        }

        const env = buildEnvInfo({
            kind: this.kind,
            executable: data.interpreterPath,
            fileInfo: await getFileInfo(data.interpreterPath),
            version,
            arch: getArchitecture(data),
            org: data.distroOrgName,
            source: [PythonEnvSource.WindowsRegistry],
        });
        env.distro.defaultDisplayName = data.companyDisplayName;
        return env;
    }
}
