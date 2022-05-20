import { Component, StringType, BooleanType } from "~/ecs/base";

export class WebPage extends Component {
  url: string;
  alwaysOn: boolean;

  static props = {
    url: {
      type: StringType,
      default: "https://google.com?igu=1",
      editor: {
        label: "Web Page URL",
        requires: [{ prop: "kind", value: "WEB_PAGE" }],
      },
    },

    alwaysOn: {
      type: BooleanType,
      default: false,
      editor: {
        label: "Force Embed",
      },
    },
  };

  static editor = {
    label: "WebPage",
  };
}