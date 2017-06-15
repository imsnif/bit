/** @flow */
import bufferFrom from 'bit/buffer/from';
import { loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';
import Source from '../../../scope/models/source';
import logger from '../../../logger/logger';

export default function status(): Promise<{ inline: Component[], sources: Component[]}> {
  return loadConsumer()
  .then(consumer => Promise.all([
    consumer.listFromFileSystem(),
    consumer.listFromBitLock(),
    consumer.scope.listFromObjects(),
    consumer.scope
  ]))
  .then(([listFromFileSystem, listFromBitLock, listFromObjects, scope]) => {
    const localScopeName = scope.name;
    const objFromFileSystem = listFromFileSystem.reduce((components, component) => {
      components[component.id.toString()] = component;
      return components;
    }, {});
    const idsFromFileSystem = Object.keys(objFromFileSystem);

    const idsFromBitLock = Object.keys(listFromBitLock);

    const objFromObjects = listFromObjects.reduce((components, component) => {
      const id = component.id.scope === localScopeName ? component.id.changeScope(null) : component.id;
      components[id.toString()] = component;
      return components;
    }, {});
    const idsFromObjects = Object.keys(objFromObjects);

    // case 1: a component is only on the FS (not the model) and not on bit.lock => "Untracked components".
    const untrackedComponents = [];
    idsFromFileSystem.forEach((id) => {
      if (!idsFromObjects.includes(id) && !idsFromBitLock.includes(id)) {
        untrackedComponents.push(id);
      }
    });

    // case 2: a component is not in the model and have a reference in bit.lock => "Modified components: new component".
    const newComponents = [];
    idsFromBitLock.forEach((id) => {
      if (!idsFromObjects.includes(id)) {
        newComponents.push(id);
      }
    });

    // case 3: a component is on the model and the scope is local => "Staged components".
    const stagedComponents = [];
    idsFromObjects.forEach((id) => {
      if (objFromObjects[id].scope === localScopeName) {
        stagedComponents.push(id);
      }
    });

    // case 4: a component is on the model and the FS, compare them.
    // if there is a different => "Modified components: modified component". Otherwise => ignore.
    const modifiedComponent = [];
    idsFromObjects.forEach((id) => {
      const newId = objFromObjects[id].id.changeScope(null);
      const componentFromFS = objFromFileSystem[newId.toString()];

      if (componentFromFS) {
        if (isComponentModified(objFromObjects[id], componentFromFS)) {
          // todo: handle the case when there are two models of the same component, each from
          // different scope
          modifiedComponent.push(id);
        }
      } else {
        logger.warn(`a component ${id} exists in the model but not on the file system`);
      }
    });

    return { untrackedComponents, newComponents, modifiedComponent, stagedComponents };
  });
}

function getHash(data): string {
  return Source.from(bufferFrom(data)).hash().toString();
}

// todo: this is a temporarily hack. The comparison must include all files and should be very fast
function isComponentModified(componentFromModel, componentFromFileSystem): boolean {
  return getHash(componentFromModel.impl.src) !== getHash(componentFromFileSystem.impl.src);
}
