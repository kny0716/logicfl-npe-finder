import * as vscode from "vscode";

export class LogicFLItem extends vscode.TreeItem {
  public children: LogicFLItem[];

  constructor(public readonly testItem: vscode.TestItem) {
    const iconMatch = testItem.label.match(/\$\(([^\)]+)\)/);
    const cleanedLabel = testItem.label.replace(/\$\([^\)]+\)\s*/, ""); // Remove the icon syntax
    const state =
      testItem.children.size > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    super(cleanedLabel, state);
    this.id = testItem.id;

    if (iconMatch) {
      this.iconPath = new vscode.ThemeIcon(iconMatch[1]); // Use the extracted icon name
    }

    if (testItem.children.size === 0) {
      this.contextValue = "logicflTestMethod";
    } else {
      this.contextValue = "logicflTestClass";
    }

    // Initialize children from testItem's children
    this.children = [];
    testItem.children.forEach((childTestItem) => {
      const child = childTestItem as vscode.TestItem;
      this.children.push(new LogicFLItem(child));
    });
  }

  setLoading(isLoading: boolean) {
    this.iconPath = isLoading
      ? new vscode.ThemeIcon("loading~spin")
      : new vscode.ThemeIcon("check");
  }
}
