/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class PathToNpmrcNotExist extends AbstractError {
  path: string;
  constructor(path: string) {
    super();
    this.path = path;
  }
}
