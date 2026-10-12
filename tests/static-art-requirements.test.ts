import assert from 'node:assert/strict';
import test from 'node:test';
import {staticArtRequirementsForView} from '../src/presentation/static-art-requirements.ts';
import {createProfile} from '../src/application/profile.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';

test('default selection requires only its scene and shared local art',()=>{
 const view=sessionHost().session.view,required=staticArtRequirementsForView(view);assert.equal(required.scene,'scene.day');assert.deepEqual(required.previews,[]);assert.ok(required.shared.includes('cargo.core'));assert.ok(required.shared.includes('forklift.base'));assert.ok(required.shared.includes('material.board'));for(const key of [required.scene,...required.shared])assert.equal(STATIC_ART_RESOURCES[key].package,'main');
});
test('saved mixed cosmetics select exact effective resources without modifying the profile',()=>{
 const view=sessionHost().session.view,account=makeAccountFixture();account.profile.cosmetics={theme:'harbor',cargo:'wood',forklift:'electric'};view.account=account;const before=JSON.stringify(account),required=staticArtRequirementsForView(view);assert.equal(required.scene,'scene.harbor');assert.ok(required.shared.includes('material.scene'));assert.ok(required.shared.includes('material.cargo'));assert.ok(required.shared.includes('forklift.styled'));assert.equal(JSON.stringify(account),before);
});
test('retired legacy direct profiles stay addressable while account retirement projection is preserved',()=>{
 const view=sessionHost().session.view;view.account=null;view.profile=createProfile();view.profile.cosmetics={theme:'express_sorting',cargo:'taped',forklift:'compact'};assert.equal(staticArtRequirementsForView(view).scene,'scene.express_sorting');const account=makeAccountFixture();account.profile.cosmetics={...view.profile.cosmetics};view.account=account;assert.equal(staticArtRequirementsForView(view).scene,'scene.day');
});
test('set cards request only the visible page and a detail replaces all cards',()=>{
 const view=sessionHost().session.view;Object.assign(view,{screen:'shop',shopTab:'cosmetics',shopSection:'sets',cosmeticSetPage:0});const first=staticArtRequirementsForView(view);assert.deepEqual(first.previews,['preview.cold_chain.card','preview.day.card','preview.rail_freight.card','preview.toy_workshop.card']);view.cosmeticSetPage=1;const next=staticArtRequirementsForView(view);assert.equal(next.previews.length,4);assert.ok(next.previews.every(key=>!first.previews.includes(key)));view.cosmeticSetPreview='harbor';assert.deepEqual(staticArtRequirementsForView(view).previews,['preview.harbor.set']);
});
test('classic detail and item previews use their own aspect-specific source',()=>{
 const view=sessionHost().session.view;Object.assign(view,{screen:'shop',shopTab:'cosmetics',shopSection:'sets',cosmeticSetPreview:'classic',classicSetSelection:{theme:'night',cargo:'outline',forklift:'white'}});assert.deepEqual(staticArtRequirementsForView(view).previews,['preview.night.classic']);Object.assign(view,{shopSection:'theme',cosmeticSetPreview:undefined,cosmeticPreview:{theme:'harbor'}});assert.deepEqual(staticArtRequirementsForView(view).previews,['preview.harbor.item']);view.shopSection='cargo';view.cosmeticPreview={cargo:'wood'};assert.deepEqual(staticArtRequirementsForView(view).previews,['preview.day.item']);assert.ok(staticArtRequirementsForView(view).shared.includes('material.cargo'));
});
test('confirmation and save blocker require no invisible shop previews',()=>{
 const view=sessionHost().session.view;Object.assign(view,{screen:'shop',shopTab:'cosmetics',shopSection:'sets',confirmation:{kind:'purchaseCosmeticSet',cosmeticSetId:'harbor'}});assert.deepEqual(staticArtRequirementsForView(view).previews,[]);view.confirmation=null;view.accountBlocked=true;assert.deepEqual(staticArtRequirementsForView(view).previews,[]);
});
