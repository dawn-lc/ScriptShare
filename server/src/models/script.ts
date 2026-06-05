export interface Script {
    id?: number;
    name: string;
    namespace: string;
    version: string;
    description: string;
    author: string;
    icon: string;
    icon64: string;
    grant: string;
    match: string;
    exclude: string;
    require: string;
    resource: string;
    connect: string;
    code: string;
    filename: string;
    userId?: number | null;
    installs: number;
    updateChecks: number;
    webhookSecret?: string;
    githubRepo?: string;
    githubPath?: string;
    githubBranch?: string;
    canaryVersion?: string;
    canaryCode?: string;
    canaryBranch?: string;
    readme?: string;
    supportURL?: string;
    i18n?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface ScriptListItem {
    id: number;
    name: string;
    namespace: string;
    version: string;
    description: string;
    author: string;
    icon: string;
    installs: number;
    updateChecks: number;
    createdAt: string;
    updatedAt: string;
    i18n?: string;
    rating?: number;
    ratingCount?: number;
}

// InstallStats and UpdateCheckResult were removed — they are defined in client/src/api/index.ts
