import { Button, Dialog } from '@folio/ui';
import { tourText } from './tourText';

/** YouTube's player without its cookies until play, from the address the site's policy lets in. */
export const TOUR = 'https://www.youtube-nocookie.com/embed/nvdMP4tHG0I?autoplay=1&rel=0&modestbranding=1&playsinline=1';

/** The film, in a dialog over the home page; closed, it is gone and the page is as it was. */
export default function TourDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog isOpen onOpenChange={(isOpen) => !isOpen && onClose()} title={tourText.title} size="lg" className="sm:max-w-4xl">
      <div className="px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="mt-3 aspect-video w-full overflow-hidden rounded-control bg-well">
          <iframe
            src={TOUR}
            title={tourText.title}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        {/* Escape and a press outside close it too; on a phone this is the one that is seen. */}
        <div className="mt-3 flex justify-end">
          <Button variant="quiet" onPress={onClose}>
            {tourText.close}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
