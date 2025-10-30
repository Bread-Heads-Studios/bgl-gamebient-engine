const path = require("path");

const programDir = path.join(__dirname, "..", "programs");

function getProgram(programBinary) {
  return path.join(programDir, ".bin", programBinary);
}

module.exports = {
  validator: {
    commitment: "processed",
    programs: [
      {
        label: "Bgl Cartridge",
        programId: "CART9hmcuf38a58NCYhRJmtGXJjh16eXmLr9hmhAqPZo",
        deployPath: getProgram("bgl_cartridge_program.so"),
      },
      {
        label: "Bgl Legit",
        programId: "LEG1T5rABhAnNFz62E4x2dSMjfsuDQyfc5sZjJi9tCq",
        deployPath: getProgram("bgl_legit_program.so"),
      },
      {
        label: "Bgl Ghost",
        programId: "GHoSTpSurgVaWBYJXnDZgiMMdKsWxjWmCvtVqE23JiS3",
        deployPath: getProgram("bgl_ghost_program.so"),
      },
      // Below are external programs that should be included in the local validator.
      // You may configure which ones to fetch from the cluster when building
      // programs within the `configs/program-scripts/dump.sh` script.
      {
        label: "MPL Core",
        programId: "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
        deployPath: getProgram("mpl_core.so"),
      },
      {
        label: "System Extras",
        programId: "SysExL2WDyJi9aRZrXorrjHJut3JwHQ7R9bTyctbNNG",
        deployPath: getProgram("mpl_system_extras.so"),
      },
      {
        label: "Token Extras",
        programId: "TokExjvjJmhKaRBShsBAsbSvEWMA1AgUNK7ps4SAc2p",
        deployPath: getProgram("mpl_token_extras.so"),
      },
    ],
  },
};
