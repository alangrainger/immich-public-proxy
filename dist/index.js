"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const express_1 = tslib_1.__importDefault(require("express"));
const immich_1 = tslib_1.__importDefault(require("./immich"));
const render_1 = tslib_1.__importDefault(require("./render"));
const dayjs_1 = tslib_1.__importDefault(require("dayjs"));
const types_1 = require("./types");
require('dotenv').config();
const app = (0, express_1.default)();
app.set('view engine', 'ejs');
app.use(express_1.default.static('public'));
const getSize = (req) => {
    var _a;
    return ((_a = req === null || req === void 0 ? void 0 : req.query) === null || _a === void 0 ? void 0 : _a.size) === 'thumbnail' ? types_1.ImageSize.thumbnail : types_1.ImageSize.original;
};
const log = (message) => console.log((0, dayjs_1.default)().format() + ' ' + message);
app.get('/share/:key', (req, res) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    res.set('Cache-Control', 'public, max-age=' + process.env.CACHE_AGE);
    if (!immich_1.default.isKey(req.params.key)) {
        log('Invalid share key ' + req.params.key);
        res.status(404).send();
    }
    else {
        const sharedLink = yield immich_1.default.getShareByKey(req.params.key);
        if (!sharedLink) {
            log('Unknown share key ' + req.params.key);
            res.status(404).send();
        }
        else if (!sharedLink.assets.length) {
            log('No assets for key ' + req.params.key);
            res.status(404).send();
        }
        else if (sharedLink.assets.length === 1) {
            // This is an individual item (not a gallery)
            const asset = sharedLink.assets[0];
            if (asset.type === types_1.AssetType.image) {
                // For photos, output the image directly
                yield render_1.default.assetBuffer(res, sharedLink.assets[0], getSize(req));
            }
            else if (asset.type === types_1.AssetType.video) {
                // For videos, show the video as a web player
                yield render_1.default.gallery(res, sharedLink, 1);
            }
        }
        else {
            // Multiple images - render as a gallery
            yield render_1.default.gallery(res, sharedLink);
        }
    }
}));
// Output the buffer data for an photo or video
app.get('/:type(photo|video)/:key/:id', (req, res) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    res.set('Cache-Control', 'public, max-age=' + process.env.CACHE_AGE);
    // Check for valid key and ID
    if (immich_1.default.isKey(req.params.key) && immich_1.default.isId(req.params.id)) {
        // Check if the key is a valid share link
        const sharedLink = yield immich_1.default.getShareByKey(req.params.key);
        if (sharedLink === null || sharedLink === void 0 ? void 0 : sharedLink.assets.length) {
            // Check that the requested asset exists in this share
            const asset = sharedLink.assets.find(x => x.id === req.params.id);
            if (asset) {
                asset.type = req.params.type === 'video' ? types_1.AssetType.video : types_1.AssetType.image;
                render_1.default.assetBuffer(res, asset, getSize(req)).then();
                return;
            }
        }
    }
    log('No asset found for ' + req.path);
    res.status(404).send();
}));
// Send a 404 for all other unmatched routes
app.get('*', (req, res) => {
    log('Invalid route ' + req.path);
    res.status(404).send();
});
app.listen(3000, () => {
    console.log((0, dayjs_1.default)().format() + ' Server started');
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsOERBQTZCO0FBQzdCLDhEQUE2QjtBQUM3Qiw4REFBNkI7QUFDN0IsMERBQXlCO0FBQ3pCLG1DQUE4QztBQUc5QyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUE7QUFFMUIsTUFBTSxHQUFHLEdBQUcsSUFBQSxpQkFBTyxHQUFFLENBQUE7QUFDckIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUE7QUFDN0IsR0FBRyxDQUFDLEdBQUcsQ0FBQyxpQkFBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFBO0FBRWpDLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBWSxFQUFFLEVBQUU7O0lBQy9CLE9BQU8sQ0FBQSxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxLQUFLLDBDQUFFLElBQUksTUFBSyxXQUFXLENBQUMsQ0FBQyxDQUFDLGlCQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxpQkFBUyxDQUFDLFFBQVEsQ0FBQTtBQUNwRixDQUFDLENBQUE7QUFFRCxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQWUsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFBLGVBQUssR0FBRSxDQUFDLE1BQU0sRUFBRSxHQUFHLEdBQUcsR0FBRyxPQUFPLENBQUMsQ0FBQTtBQUU5RSxHQUFHLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxDQUFPLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtJQUN4QyxHQUFHLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxrQkFBa0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFBO0lBQ3BFLElBQUksQ0FBQyxnQkFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDMUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQTtJQUN4QixDQUFDO1NBQU0sQ0FBQztRQUNOLE1BQU0sVUFBVSxHQUFHLE1BQU0sZ0JBQU0sQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUM3RCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDaEIsR0FBRyxDQUFDLG9CQUFvQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7WUFDMUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQTtRQUN4QixDQUFDO2FBQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDckMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7WUFDMUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQTtRQUN4QixDQUFDO2FBQU0sSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMxQyw2Q0FBNkM7WUFDN0MsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUNsQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssaUJBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDbkMsd0NBQXdDO2dCQUN4QyxNQUFNLGdCQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO1lBQ25FLENBQUM7aUJBQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLGlCQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQzFDLDZDQUE2QztnQkFDN0MsTUFBTSxnQkFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFBO1lBQzFDLENBQUM7UUFDSCxDQUFDO2FBQU0sQ0FBQztZQUNOLHdDQUF3QztZQUN4QyxNQUFNLGdCQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsQ0FBQTtRQUN2QyxDQUFDO0lBQ0gsQ0FBQztBQUNILENBQUMsQ0FBQSxDQUFDLENBQUE7QUFFRiwrQ0FBK0M7QUFDL0MsR0FBRyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsRUFBRSxDQUFPLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtJQUN6RCxHQUFHLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxrQkFBa0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFBO0lBQ3BFLDZCQUE2QjtJQUM3QixJQUFJLGdCQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksZ0JBQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQy9ELHlDQUF5QztRQUN6QyxNQUFNLFVBQVUsR0FBRyxNQUFNLGdCQUFNLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDN0QsSUFBSSxVQUFVLGFBQVYsVUFBVSx1QkFBVixVQUFVLENBQUUsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzlCLHNEQUFzRDtZQUN0RCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQTtZQUNqRSxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNWLEtBQUssQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxpQkFBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsaUJBQVMsQ0FBQyxLQUFLLENBQUE7Z0JBQzVFLGdCQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUE7Z0JBQ25ELE9BQU07WUFDUixDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFDRCxHQUFHLENBQUMscUJBQXFCLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQ3JDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUE7QUFDeEIsQ0FBQyxDQUFBLENBQUMsQ0FBQTtBQUVGLDRDQUE0QztBQUM1QyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtJQUN4QixHQUFHLENBQUMsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQ2hDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUE7QUFDeEIsQ0FBQyxDQUFDLENBQUE7QUFFRixHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUU7SUFDcEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFBLGVBQUssR0FBRSxDQUFDLE1BQU0sRUFBRSxHQUFHLGlCQUFpQixDQUFDLENBQUE7QUFDbkQsQ0FBQyxDQUFDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZXhwcmVzcyBmcm9tICdleHByZXNzJ1xuaW1wb3J0IGltbWljaCBmcm9tICcuL2ltbWljaCdcbmltcG9ydCByZW5kZXIgZnJvbSAnLi9yZW5kZXInXG5pbXBvcnQgZGF5anMgZnJvbSAnZGF5anMnXG5pbXBvcnQgeyBBc3NldFR5cGUsIEltYWdlU2l6ZSB9IGZyb20gJy4vdHlwZXMnXG5pbXBvcnQgeyBSZXF1ZXN0IH0gZnJvbSAnZXhwcmVzcy1zZXJ2ZS1zdGF0aWMtY29yZSdcblxucmVxdWlyZSgnZG90ZW52JykuY29uZmlnKClcblxuY29uc3QgYXBwID0gZXhwcmVzcygpXG5hcHAuc2V0KCd2aWV3IGVuZ2luZScsICdlanMnKVxuYXBwLnVzZShleHByZXNzLnN0YXRpYygncHVibGljJykpXG5cbmNvbnN0IGdldFNpemUgPSAocmVxOiBSZXF1ZXN0KSA9PiB7XG4gIHJldHVybiByZXE/LnF1ZXJ5Py5zaXplID09PSAndGh1bWJuYWlsJyA/IEltYWdlU2l6ZS50aHVtYm5haWwgOiBJbWFnZVNpemUub3JpZ2luYWxcbn1cblxuY29uc3QgbG9nID0gKG1lc3NhZ2U6IHN0cmluZykgPT4gY29uc29sZS5sb2coZGF5anMoKS5mb3JtYXQoKSArICcgJyArIG1lc3NhZ2UpXG5cbmFwcC5nZXQoJy9zaGFyZS86a2V5JywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gIHJlcy5zZXQoJ0NhY2hlLUNvbnRyb2wnLCAncHVibGljLCBtYXgtYWdlPScgKyBwcm9jZXNzLmVudi5DQUNIRV9BR0UpXG4gIGlmICghaW1taWNoLmlzS2V5KHJlcS5wYXJhbXMua2V5KSkge1xuICAgIGxvZygnSW52YWxpZCBzaGFyZSBrZXkgJyArIHJlcS5wYXJhbXMua2V5KVxuICAgIHJlcy5zdGF0dXMoNDA0KS5zZW5kKClcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBzaGFyZWRMaW5rID0gYXdhaXQgaW1taWNoLmdldFNoYXJlQnlLZXkocmVxLnBhcmFtcy5rZXkpXG4gICAgaWYgKCFzaGFyZWRMaW5rKSB7XG4gICAgICBsb2coJ1Vua25vd24gc2hhcmUga2V5ICcgKyByZXEucGFyYW1zLmtleSlcbiAgICAgIHJlcy5zdGF0dXMoNDA0KS5zZW5kKClcbiAgICB9IGVsc2UgaWYgKCFzaGFyZWRMaW5rLmFzc2V0cy5sZW5ndGgpIHtcbiAgICAgIGxvZygnTm8gYXNzZXRzIGZvciBrZXkgJyArIHJlcS5wYXJhbXMua2V5KVxuICAgICAgcmVzLnN0YXR1cyg0MDQpLnNlbmQoKVxuICAgIH0gZWxzZSBpZiAoc2hhcmVkTGluay5hc3NldHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAvLyBUaGlzIGlzIGFuIGluZGl2aWR1YWwgaXRlbSAobm90IGEgZ2FsbGVyeSlcbiAgICAgIGNvbnN0IGFzc2V0ID0gc2hhcmVkTGluay5hc3NldHNbMF1cbiAgICAgIGlmIChhc3NldC50eXBlID09PSBBc3NldFR5cGUuaW1hZ2UpIHtcbiAgICAgICAgLy8gRm9yIHBob3Rvcywgb3V0cHV0IHRoZSBpbWFnZSBkaXJlY3RseVxuICAgICAgICBhd2FpdCByZW5kZXIuYXNzZXRCdWZmZXIocmVzLCBzaGFyZWRMaW5rLmFzc2V0c1swXSwgZ2V0U2l6ZShyZXEpKVxuICAgICAgfSBlbHNlIGlmIChhc3NldC50eXBlID09PSBBc3NldFR5cGUudmlkZW8pIHtcbiAgICAgICAgLy8gRm9yIHZpZGVvcywgc2hvdyB0aGUgdmlkZW8gYXMgYSB3ZWIgcGxheWVyXG4gICAgICAgIGF3YWl0IHJlbmRlci5nYWxsZXJ5KHJlcywgc2hhcmVkTGluaywgMSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTXVsdGlwbGUgaW1hZ2VzIC0gcmVuZGVyIGFzIGEgZ2FsbGVyeVxuICAgICAgYXdhaXQgcmVuZGVyLmdhbGxlcnkocmVzLCBzaGFyZWRMaW5rKVxuICAgIH1cbiAgfVxufSlcblxuLy8gT3V0cHV0IHRoZSBidWZmZXIgZGF0YSBmb3IgYW4gcGhvdG8gb3IgdmlkZW9cbmFwcC5nZXQoJy86dHlwZShwaG90b3x2aWRlbykvOmtleS86aWQnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgcmVzLnNldCgnQ2FjaGUtQ29udHJvbCcsICdwdWJsaWMsIG1heC1hZ2U9JyArIHByb2Nlc3MuZW52LkNBQ0hFX0FHRSlcbiAgLy8gQ2hlY2sgZm9yIHZhbGlkIGtleSBhbmQgSURcbiAgaWYgKGltbWljaC5pc0tleShyZXEucGFyYW1zLmtleSkgJiYgaW1taWNoLmlzSWQocmVxLnBhcmFtcy5pZCkpIHtcbiAgICAvLyBDaGVjayBpZiB0aGUga2V5IGlzIGEgdmFsaWQgc2hhcmUgbGlua1xuICAgIGNvbnN0IHNoYXJlZExpbmsgPSBhd2FpdCBpbW1pY2guZ2V0U2hhcmVCeUtleShyZXEucGFyYW1zLmtleSlcbiAgICBpZiAoc2hhcmVkTGluaz8uYXNzZXRzLmxlbmd0aCkge1xuICAgICAgLy8gQ2hlY2sgdGhhdCB0aGUgcmVxdWVzdGVkIGFzc2V0IGV4aXN0cyBpbiB0aGlzIHNoYXJlXG4gICAgICBjb25zdCBhc3NldCA9IHNoYXJlZExpbmsuYXNzZXRzLmZpbmQoeCA9PiB4LmlkID09PSByZXEucGFyYW1zLmlkKVxuICAgICAgaWYgKGFzc2V0KSB7XG4gICAgICAgIGFzc2V0LnR5cGUgPSByZXEucGFyYW1zLnR5cGUgPT09ICd2aWRlbycgPyBBc3NldFR5cGUudmlkZW8gOiBBc3NldFR5cGUuaW1hZ2VcbiAgICAgICAgcmVuZGVyLmFzc2V0QnVmZmVyKHJlcywgYXNzZXQsIGdldFNpemUocmVxKSkudGhlbigpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH1cbiAgfVxuICBsb2coJ05vIGFzc2V0IGZvdW5kIGZvciAnICsgcmVxLnBhdGgpXG4gIHJlcy5zdGF0dXMoNDA0KS5zZW5kKClcbn0pXG5cbi8vIFNlbmQgYSA0MDQgZm9yIGFsbCBvdGhlciB1bm1hdGNoZWQgcm91dGVzXG5hcHAuZ2V0KCcqJywgKHJlcSwgcmVzKSA9PiB7XG4gIGxvZygnSW52YWxpZCByb3V0ZSAnICsgcmVxLnBhdGgpXG4gIHJlcy5zdGF0dXMoNDA0KS5zZW5kKClcbn0pXG5cbmFwcC5saXN0ZW4oMzAwMCwgKCkgPT4ge1xuICBjb25zb2xlLmxvZyhkYXlqcygpLmZvcm1hdCgpICsgJyBTZXJ2ZXIgc3RhcnRlZCcpXG59KVxuIl19