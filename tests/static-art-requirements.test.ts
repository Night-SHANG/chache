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
 const view=sessionHost().session.view,account=makeAccountFixture();account.profile.cosmetics={theme:'cold_chain',cargo:'wood',forklift:'electric'};view.account=account;const before=JSON.stringify(account),required=staticArtRequirementsForView(view);assert.equal(required.scene,'scene.cold_chain');assert.ok(required.shared.includes('material.scene'));assert.ok(required.shared.includes('material.cargo'));assert.ok(required.shared.includes('forklift.styled'));assert.equal(JSON.stringify(account),before);
});
test('retired legacy and account profiles use safe active resources without mutation',()=>{
 const view=sessionHost().session.view;view.account=null;view.profile=createProfile();view.profile.cosmetics={theme:'express_sorting',cargo:'taped',forklift:'compact'};assert.equal(staticArtRequirementsForView(view).scene,'scene.day');const account=makeAccountFixture();account.profile.cosmetics={...view.profile.cosmetics};view.account=account;assert.equal(staticArtRequirementsForView(view).scene,'scene.day');
});
test('retired set navigation state cannot request removed preview shapes',()=>{
 const view=sessionHost().session.view;Object.assign(view,{screen:'shop',shopTab:'cosmetics',shopSection:'sets',cosmeticSetPage:3,cosmeticSetPreview:'classic'});
 assert.deepEqual(staticArtRequirementsForView(view).previews,[]);
});
test('theme and cargo browsing use already-pinned shared art without per-item image requests',()=>{
 const view=sessionHost().session.view;Object.assign(view,{screen:'shop',shopTab:'cosmetics',shopSection:'theme',cosmeticPreview:{theme:'cold_chain'}});
 assert.deepEqual(staticArtRequirementsForView(view).previews,[]);view.shopSection='cargo';view.cosmeticPreview={cargo:'wood'};
 assert.deepEqual(staticArtRequirementsForView(view).previews,[]);assert.ok(staticArtRequirementsForView(view).shared.includes('material.cargo'));
});
test('confirmation and save blocker require no invisible shop previews',()=>{
 const view=sessionHost().session.view;Object.assign(view,{screen:'shop',shopTab:'cosmetics',shopSection:'sets',confirmation:{kind:'purchaseCosmeticSet',cosmeticSetId:'harbor'}});assert.deepEqual(staticArtRequirementsForView(view).previews,[]);view.confirmation=null;view.accountBlocked=true;assert.deepEqual(staticArtRequirementsForView(view).previews,[]);
});
