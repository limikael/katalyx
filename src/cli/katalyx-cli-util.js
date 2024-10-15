export function getContentFileAction(contentFile) {
	if ((contentFile.syncHash && !contentFile.hash) ||
			(contentFile.syncFile && !contentFile.remoteFile))
		return "delete";

	if (contentFile.remoteFile!=contentFile.syncFile)
		return "download";

	if (contentFile.hash!=contentFile.syncHash)
		return "upload";
}
