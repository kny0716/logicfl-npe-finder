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
      return Promise.resolve(this.rootItems);
    }
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

  removeItem(item: LogicFLItem): void {
    const index = this.rootItems.findIndex((i) => i.id === item.id);
    if (index > -1) {
      this.rootItems.splice(index, 1);
      this.refresh();
      vscode.window.showInformationMessage(
        `'${item.label}' 항목을 LogicFL View에서 제거했습니다.`
      );
    }
  }
}
