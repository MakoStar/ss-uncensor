const fs = require('fs');
const { relative } = require('../config/paths');
const log = require('../log/log');

class ManiResource {
    file: any;
    hash: any;
    size: any;
    fileType: any;

    constructor(file, hash, size, fileType) {
        this.file = file;
        this.hash = hash;
        this.size = size;
        this.fileType = fileType;
    }
}

class ManiReader {
    maniFilePath: any;
    resourceData: any;
    configData: any;

    constructor(mainFilePath) {
        this.maniFilePath = mainFilePath;
        this.resourceData = new Map();
        this.configData = new Map();
        this.parse();
    }

    parse() {
        try {
            const content = fs.readFileSync(this.maniFilePath, 'utf-8');
            const lines = content.split(/\r?\n/);
            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) continue;
                if (line.startsWith('$')) {
                    const entry = line.substring(1);
                    const splitIndex = entry.indexOf(':');
                    if (splitIndex !== -1) {
                        const key = entry.substring(0, splitIndex).trim();
                        const value = entry.substring(splitIndex + 1).trim();
                        this.configData.set(key, value);
                    }
                } else {
                    const parts = line.split('|');
                    if (parts.length < 4) {
                        log.warn(`[read] ${relative(this.maniFilePath)}: skipping malformed line ${line}`);
                        continue;
                    }
                    const fileName = parts[0].trim();
                    this.resourceData.set(fileName, new ManiResource(
                        fileName,
                        parts[1].trim(),
                        parseInt(parts[2].trim(), 10) || 0,
                        parts[3].trim()
                    ));
                }
            }
        } catch (error) {
            throw new Error(`Failed to read mani file: ${relative(this.maniFilePath)} - ${error.message}`);
        }
    }

    resources() {
        const items: any[] = Array.from(this.resourceData.values());
        items.sort((a, b) => a.file.localeCompare(b.file));
        return items;
    }

    getResourceHashByPatch(patchName) {
        if (this.resourceData.size === 0) {
            log.warn(`[read] ${relative(this.maniFilePath)}: manifest resource data is empty`);
            return null;
        }
        const res = this.resourceData.get(patchName);
        return res ? res.hash : null;
    }

    getConfigValueByKey(key) {
        if (this.configData.size === 0) {
            log.warn(`[read] ${relative(this.maniFilePath)}: manifest config data is empty`);
            return null;
        }
        const value = this.configData.get(key);
        if (value === undefined) {
            log.warn(`missing config key '${key}'`);
            return null;
        }
        return value;
    }
}

module.exports = { ManiReader, ManiResource };
