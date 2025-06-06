import * as vscode from "vscode";
import { LogicFLItem } from "../models/logicFLItem";

export class LogicFLTreeViewProvider
  implements vscode.TreeDataProvider<LogicFLItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    LogicFLItem | undefined | void
  > = new vscode.EventEmitter<LogicFLItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<LogicFLItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private rootItems: LogicFLItem[] = [];

  getTreeItem(element: LogicFLItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LogicFLItem): Thenable<LogicFLItem[]> {
    if (!element) {
      // Return an empty array if no root items are defined
      return Promise.resolve(this.rootItems);
    }
    // Return children of the given element
    return Promise.resolve(element.children);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  findItemById(
    rootItems: LogicFLItem[],
    targetId: string
  ): LogicFLItem | undefined {
    for (const item of rootItems) {
      if (item.id === targetId) {
        return item;
      }

      const found = this.findItemById(item.children, targetId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  addItem(item: vscode.TestItem | LogicFLItem): void {
    const testItemId = item.id;
    if (!testItemId) {
      vscode.window.showErrorMessage("항목에 ID가 없습니다.");
      return;
    }
    const isAlreadyRegistered = !!this.findItemById(this.rootItems, testItemId);
    if (isAlreadyRegistered) {
      vscode.window.showInformationMessage("이 항목은 이미 등록되어 있습니다.");
      return;
    }

    const logicFLItem =
      item instanceof LogicFLItem ? item : new LogicFLItem(item);
    this.rootItems.push(logicFLItem);

    this._onDidChangeTreeData.fire();
  }
}
