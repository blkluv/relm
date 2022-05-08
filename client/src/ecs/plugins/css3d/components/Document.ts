import { Component, StringType, NumberType, BooleanType } from "~/ecs/base";

export class Document extends Component {
  docId: string;
  bgColor: string;
  borderColor: string;
  editable: boolean;

  static props = {
    docId: {
      type: StringType,
      default: "doc1",
      editor: {
        label: "Document ID",
      },
    },

    bgColor: {
      type: StringType,
      default: "#ffffff",
      editor: {
        label: "Background Color",
        input: "Color",
      },
    },

    editable: {
      type: BooleanType,
      default: false,
      editor: {
        label: "Editable",
      },
    },
  };

  static editor = {
    label: "Document",
  };
}
