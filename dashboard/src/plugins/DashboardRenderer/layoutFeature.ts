import { bpSpanPx, Feature, Region, SimpleFeature } from '@jbrowse/core/util'
import { BaseLayout } from '@jbrowse/core/util/layouts'
// locals
import { Mismatch } from '../MismatchParser'

export interface LayoutRecord {
  feature: Feature
  leftPx: number
  rightPx: number
  topPx: number
  heightPx: number
}

export function layoutFeature({
  feature,
  layout,
  bpPerPx,
  region,
  showSoftClip,
  heightPx,
  displayMode,
  unseen_mutations
}: {
  feature: Feature
  layout: BaseLayout<Feature>
  bpPerPx: number
  region: Region
  showSoftClip?: boolean
  heightPx: number
  displayMode: string
  unseen_mutations: {}
}): LayoutRecord | null {
  let expansionBefore = 0
  let expansionAfter = 0

  // Expand the start and end of feature when softclipping enabled
  if (showSoftClip) {
    const mismatches = feature.get('mismatches') as Mismatch[]
    const seq = feature.get('seq') as string
    if (seq) {
      for (const { type, start, cliplen = 0 } of mismatches) {
        if (type === 'softclip') {
          start === 0 ? (expansionBefore = cliplen) : (expansionAfter = cliplen)
        }
      }
    }
  }

  const [leftPx, rightPx] = bpSpanPx(
    feature.get('start') - expansionBefore,
    feature.get('end') + expansionAfter,
    region,
    bpPerPx,
  )

  if (displayMode === 'compact') {
    heightPx /= 3
  }

  const myfeature = new SimpleFeature(feature.toJSON())

  const unseenid = feature.get('UM');

  if (unseen_mutations[unseenid]){
    myfeature.set("UM", `${unseenid}: ${unseen_mutations[unseenid]}`);
  }

  feature = new SimpleFeature(myfeature.toJSON())
  
  if (feature.get('refName') !== region.refName) {
    throw new Error(
      `feature ${feature.id()} is not on the current region's reference sequence ${
        region.refName
      }`,
    )
  }
  const topPx = layout.addRect(
    feature.id(),
    feature.get('start') - expansionBefore,
    feature.get('end') + expansionAfter,
    heightPx,
    feature,
  )
  if (topPx === null) {
    return null
  }

  return {
    feature,
    leftPx,
    rightPx,
    topPx: displayMode === 'collapse' ? 0 : topPx,
    heightPx,
  }
}