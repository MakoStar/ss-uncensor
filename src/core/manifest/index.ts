'use strict';

const { ManiReader } = require('./reader');
const { check, checkAll } = require('./check');
const { runDiff, diffManifests } = require('./diff');
const { runPipeline, buildAll, availableRegions } = require('./pipeline');
const { mergeBundles, mergeVersions, versionCompare } = require('./merge');
const { fetchRegions, fetchRegion } = require('../network/fetcher');
const { parseManifest, serializeManifest, getMeta, metaValues, bundleSize } = require('./parse');
const { discoverSources, buildManifest, buildRegion, knownRegions: patchRegions, namesOf } = require('./build');

module.exports = {
  fetchRegions,
  fetchRegion,
  discoverSources,
  buildManifest,
  buildRegion,
  buildAll,
  patchRegions,
  namesOf,
  runDiff,
  diffManifests,
  runPipeline,
  availableRegions,
  check,
  checkAll,
  parseManifest,
  serializeManifest,
  getMeta,
  metaValues,
  bundleSize,
  ManiReader,
  mergeBundles,
  mergeVersions,
  versionCompare,
};
