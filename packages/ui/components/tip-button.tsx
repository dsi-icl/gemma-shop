import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

function TipButton({
    tip,
    tipSide,
    children,
    ...props
}: { tip: string; tipSide?: Parameters<typeof TooltipContent>[0]['side'] } & React.ComponentProps<
    typeof Button
>) {
    return (
        <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" {...props} />}>
                {children}
            </TooltipTrigger>
            <TooltipContent side={tipSide}>{tip}</TooltipContent>
        </Tooltip>
    );
}

export { TipButton };
